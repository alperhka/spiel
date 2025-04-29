// Copyright (C) 2016 - present Juergen Zimmermann, Hochschule Karlsruhe
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

/**
 * Das Modul besteht aus der Klasse {@linkcode SpielWriteService} für die
 * Schreiboperationen im Anwendungskern.
 * @packageDocumentation
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type DeleteResult, Repository } from 'typeorm';
import { getLogger } from '../../logger/logger.js';
import { MailService } from '../../mail/mail.service.js';
import { Bild } from '../entity/bild.entity.js';
import { Spiel } from '../entity/spiel.entity.js';
import { SpielFile } from '../entity/spielFile.entity.js';
import { Name } from '../entity/name.entity.js';
import { SpielReadService } from './spiel-read.service.js';
import {
    BarcodeExistsException,
    VersionInvalidException,
    VersionOutdatedException,
} from './exceptions.js';

/** Typdefinitionen zum Aktualisieren eines Spieles mit `update`. */
export type UpdateParams = {
    /** ID des zu aktualisierenden Spieles. */
    readonly id: number | undefined;
    /** Spiel-Objekt mit den aktualisierten Werten. */
    readonly spiel: Spiel;
    /** Versionsnummer für die aktualisierenden Werte. */
    readonly version: string;
};

// TODO Transaktionen, wenn mehr als 1 TypeORM-Schreibmethode involviert ist
// https://docs.nestjs.com/techniques/database#typeorm-transactions
// https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional
// https://betterprogramming.pub/handling-transactions-in-typeorm-and-nest-js-with-ease-3a417e6ab5
// https://bytesmith.dev/blog/20240320-nestjs-transactions

/**
 * Die Klasse `SpielWriteService` implementiert den Anwendungskern für das
 * Schreiben von Bücher und greift mit _TypeORM_ auf die DB zu.
 */
@Injectable()
export class SpielWriteService {
    private static readonly VERSION_PATTERN = /^"\d{1,3}"/u;

    readonly #repo: Repository<Spiel>;

    readonly #fileRepo: Repository<SpielFile>;

    readonly #readService: SpielReadService;

    readonly #mailService: MailService;

    readonly #logger = getLogger(SpielWriteService.name);

    // eslint-disable-next-line max-params
    constructor(
        @InjectRepository(Spiel) repo: Repository<Spiel>,
        @InjectRepository(SpielFile) fileRepo: Repository<SpielFile>,
        readService: SpielReadService,
        mailService: MailService,
    ) {
        this.#repo = repo;
        this.#fileRepo = fileRepo;
        this.#readService = readService;
        this.#mailService = mailService;
    }

    /**
     * Ein neues Spiel soll angelegt werden.
     * @param spiel Das neu abzulegende Spiel
     * @returns Die ID des neu angelegten Spieles
     * @throws BarcodeExists falls die Barcode-Nummer bereits existiert
     */
    async create(spiel: Spiel) {
        this.#logger.debug('create: spiel=%o', spiel);
        await this.#validateCreate(spiel);

        const spielDb = await this.#repo.save(spiel); // implizite Transaktion
        await this.#sendmail(spielDb);

        return spielDb.id!;
    }

    /**
     * Zu einem vorhandenen Spiel ein3 Binärdatei mit z.B. einem Bild abspeichern.
     * @param spielId ID des vorhandenen Spieles
     * @param data Bytes der Datei
     * @param filename Dateiname
     * @param mimetype MIME-Type
     * @returns Entity-Objekt für `SpielFile`
     */
    // eslint-disable-next-line max-params
    async addFile(
        spielId: number,
        data: Buffer,
        filename: string,
        mimetype: string,
    ): Promise<Readonly<SpielFile>> {
        this.#logger.debug(
            'addFile: spielId: %d, filename:%s, mimetype: %s',
            spielId,
            filename,
            mimetype,
        );

        // Spiel ermitteln, falls vorhanden
        const spiel = await this.#readService.findById({ id: spielId });

        // evtl. vorhandene Datei loeschen
        await this.#fileRepo
            .createQueryBuilder('spiel_file')
            .delete()
            .where('spiel_id = :id', { id: spielId })
            .execute();

        // Entity-Objekt aufbauen, um es spaeter in der DB zu speichern (s.u.)
        const spielFile = this.#fileRepo.create({
            filename,
            data,
            mimetype,
            spiel,
        });

        // Den Datensatz fuer Spiel mit der neuen Binaerdatei aktualisieren
        await this.#repo.save({
            id: spiel.id,
            file: spielFile,
        });

        return spielFile;
    }

    /**
     * Ein vorhandenes Spiel soll aktualisiert werden. "Destructured" Argument
     * mit id (ID des zu aktualisierenden Spiels), spiel (zu aktualisierendes Spiel)
     * und version (Versionsnummer für optimistische Synchronisation).
     * @returns Die neue Versionsnummer gemäß optimistischer Synchronisation
     * @throws NotFoundException falls kein Spiel zur ID vorhanden ist
     * @throws VersionInvalidException falls die Versionsnummer ungültig ist
     * @throws VersionOutdatedException falls die Versionsnummer veraltet ist
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async update({ id, spiel, version }: UpdateParams) {
        this.#logger.debug(
            'update: id=%d, spiel=%o, version=%s',
            id,
            spiel,
            version,
        );
        if (id === undefined) {
            this.#logger.debug('update: Keine gueltige ID');
            throw new NotFoundException(`Es gibt kein Spiel mit der ID ${id}.`);
        }

        const validateResult = await this.#validateUpdate(spiel, id, version);
        this.#logger.debug('update: validateResult=%o', validateResult);
        if (!(validateResult instanceof Spiel)) {
            return validateResult;
        }

        const spielNeu = validateResult;
        const merged = this.#repo.merge(spielNeu, spiel);
        this.#logger.debug('update: merged=%o', merged);
        const updated = await this.#repo.save(merged); // implizite Transaktion
        this.#logger.debug('update: updated=%o', updated);

        return updated.version!;
    }

    /**
     * Ein Spiel wird asynchron anhand seiner ID gelöscht.
     *
     * @param id ID des zu löschenden Spieles
     * @returns true, falls das Spiel vorhanden war und gelöscht wurde. Sonst false.
     */
    async delete(id: number) {
        this.#logger.debug('delete: id=%d', id);
        const spiel = await this.#readService.findById({
            id,
            mitBilder: true,
        });

        let deleteResult: DeleteResult | undefined;
        await this.#repo.manager.transaction(async (transactionalMgr) => {
            // Das Spiel zur gegebenen ID mit Name und Abb. asynchron loeschen

            // TODO "cascade" funktioniert nicht beim Loeschen
            const nameId = spiel.name?.id;
            if (nameId !== undefined) {
                await transactionalMgr.delete(Name, nameId);
            }
            // "Nullish Coalescing" ab ES2020
            const bilder = spiel.bilder ?? [];
            for (const bild of bilder) {
                await transactionalMgr.delete(Bild, bild.id);
            }

            deleteResult = await transactionalMgr.delete(Spiel, id);
            this.#logger.debug('delete: deleteResult=%o', deleteResult);
        });

        return (
            deleteResult?.affected !== undefined &&
            deleteResult.affected !== null &&
            deleteResult.affected > 0
        );
    }

    async #validateCreate({ barcode }: Spiel): Promise<undefined> {
        this.#logger.debug('#validateCreate: barcode=%s', barcode);
        if (await this.#repo.existsBy({ barcode })) {
            throw new BarcodeExistsException(barcode);
        }
    }

    async #sendmail(spiel: Spiel) {
        const subject = `Neues Spiel ${spiel.id}`;
        const name = spiel.name?.name ?? 'N/A';
        const body = `Das Spiel mit dem Name <strong>${name}</strong> ist angelegt`;
        await this.#mailService.sendmail({ subject, body });
    }

    async #validateUpdate(
        spiel: Spiel,
        id: number,
        versionStr: string,
    ): Promise<Spiel> {
        this.#logger.debug(
            '#validateUpdate: spiel=%o, id=%s, versionStr=%s',
            spiel,
            id,
            versionStr,
        );
        if (!SpielWriteService.VERSION_PATTERN.test(versionStr)) {
            throw new VersionInvalidException(versionStr);
        }

        const version = Number.parseInt(versionStr.slice(1, -1), 10);
        this.#logger.debug(
            '#validateUpdate: spiel=%o, version=%d',
            spiel,
            version,
        );

        const spielDb = await this.#readService.findById({ id });

        // nullish coalescing
        const versionDb = spielDb.version!;
        if (version < versionDb) {
            this.#logger.debug('#validateUpdate: versionDb=%d', version);
            throw new VersionOutdatedException(version);
        }
        this.#logger.debug('#validateUpdate: spielDb=%o', spielDb);
        return spielDb;
    }
}

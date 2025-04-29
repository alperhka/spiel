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
 * Das Modul besteht aus der Klasse {@linkcode SpielReadService}.
 * @packageDocumentation
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getLogger } from '../../logger/logger.js';
import { SpielFile } from '../entity/spielFile.entity.js';
import { Spiel } from '../entity/spiel.entity.js';
import { type Pageable } from './pageable.js';
import { type Slice } from './slice.js';
import { QueryBuilder } from './query-builder.js';
import { type Suchkriterien } from './suchkriterien.js';

/**
 * Typdefinition für `findById`
 */
export type FindByIdParams = {
    /** ID des gesuchten Spiels */
    readonly id: number;
    /** Sollen die Bilder mitgeladen werden? */
    readonly mitBilder?: boolean;
};

/**
 * Die Klasse `SpielReadService` implementiert das Lesen für Bücher und greift
 * mit _TypeORM_ auf eine relationale DB zu.
 */
@Injectable()
export class SpielReadService {
    static readonly ID_PATTERN = /^[1-9]\d{0,10}$/u;

    readonly #spielProps: string[];

    readonly #queryBuilder: QueryBuilder;

    readonly #fileRepo: Repository<SpielFile>;

    readonly #logger = getLogger(SpielReadService.name);

    constructor(
        queryBuilder: QueryBuilder,
        @InjectRepository(SpielFile) fileRepo: Repository<SpielFile>,
    ) {
        const spielDummy = new Spiel();
        this.#spielProps = Object.getOwnPropertyNames(spielDummy);
        this.#queryBuilder = queryBuilder;
        this.#fileRepo = fileRepo;
    }

    // Rueckgabetyp Promise bei asynchronen Funktionen
    //    ab ES2015
    //    vergleiche Task<> bei C#
    // Status eines Promise:
    //    Pending: das Resultat ist noch nicht vorhanden, weil die asynchrone
    //             Operation noch nicht abgeschlossen ist
    //    Fulfilled: die asynchrone Operation ist abgeschlossen und
    //               das Promise-Objekt hat einen Wert
    //    Rejected: die asynchrone Operation ist fehlgeschlagen and das
    //              Promise-Objekt wird nicht den Status "fulfilled" erreichen.
    //              Im Promise-Objekt ist dann die Fehlerursache enthalten.

    /**
     * Ein Spiel asynchron anhand seiner ID suchen
     * @param id ID des gesuchten Spieles
     * @returns Das gefundene Spiel in einem Promise aus ES2015.
     * @throws NotFoundException falls kein Spiel mit der ID existiert
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async findById({
        id,
        mitBilder = false,
    }: FindByIdParams): Promise<Readonly<Spiel>> {
        this.#logger.debug('findById: id=%d', id);

        // https://typeorm.io/working-with-repository
        // Das Resultat ist undefined, falls kein Datensatz gefunden
        // Lesen: Keine Transaktion erforderlich
        const spiel = await this.#queryBuilder
            .buildId({ id, mitBilder })
            .getOne();
        if (spiel === null) {
            throw new NotFoundException(`Es gibt kein Spiel mit der ID ${id}.`);
        }
        if (spiel.schlagwoerter === null) {
            spiel.schlagwoerter = [];
        }

        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'findById: spiel=%s, name=%o',
                spiel.toString(),
                spiel.name,
            );
            if (mitBilder) {
                this.#logger.debug(
                    'findById: bilder=%o',
                    spiel.bilder,
                );
            }
        }
        return spiel;
    }

    /**
     * Binärdatei zu einem Spiel suchen.
     * @param spielId ID des zugehörigen Spiels.
     * @returns Binärdatei oder undefined als Promise.
     */
    async findFileBySpielId(
        spielId: number,
    ): Promise<Readonly<SpielFile> | undefined> {
        this.#logger.debug('findFileBySpielId: spielId=%s', spielId);
        const spielFile = await this.#fileRepo
            .createQueryBuilder('spiel_file')
            .where('spiel_id = :id', { id: spielId })
            .getOne();
        if (spielFile === null) {
            this.#logger.debug('findFileBySpielId: Keine Datei gefunden');
            return;
        }

        this.#logger.debug('findFileBySpielId: filename=%s', spielFile.filename);
        return spielFile;
    }

    /**
     * Bücher asynchron suchen.
     * @param suchkriterien JSON-Objekt mit Suchkriterien.
     * @param pageable Maximale Anzahl an Datensätzen und Seitennummer.
     * @returns Ein JSON-Array mit den gefundenen Büchern.
     * @throws NotFoundException falls keine Bücher gefunden wurden.
     */
    async find(
        suchkriterien: Suchkriterien | undefined,
        pageable: Pageable,
    ): Promise<Slice<Spiel>> {
        this.#logger.debug(
            'find: suchkriterien=%o, pageable=%o',
            suchkriterien,
            pageable,
        );

        // Keine Suchkriterien?
        if (suchkriterien === undefined) {
            return await this.#findAll(pageable);
        }
        const keys = Object.keys(suchkriterien);
        if (keys.length === 0) {
            return await this.#findAll(pageable);
        }

        // Falsche Namen fuer Suchkriterien?
        if (!this.#checkKeys(keys) || !this.#checkEnums(suchkriterien)) {
            throw new NotFoundException('Ungueltige Suchkriterien');
        }

        // QueryBuilder https://typeorm.io/select-query-builder
        // Das Resultat ist eine leere Liste, falls nichts gefunden
        // Lesen: Keine Transaktion erforderlich
        const queryBuilder = this.#queryBuilder.build(suchkriterien, pageable);
        const spiele = await queryBuilder.getMany();
        if (spiele.length === 0) {
            this.#logger.debug('find: Keine Spiele gefunden');
            throw new NotFoundException(
                `Keine Spiele gefunden: ${JSON.stringify(suchkriterien)}, Seite ${pageable.number}}`,
            );
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(spiele, totalElements);
    }

    async #findAll(pageable: Pageable) {
        const queryBuilder = this.#queryBuilder.build({}, pageable);
        const spiele = await queryBuilder.getMany();
        if (spiele.length === 0) {
            throw new NotFoundException(`Ungueltige Seite "${pageable.number}"`);
        }
        const totalElements = await queryBuilder.getCount();
        return this.#createSlice(spiele, totalElements);

    }

    #createSlice(spiele: Spiel[], totalElements: number) {
        spiele.forEach((spiel) => {
            if (spiel.schlagwoerter === null) {
                spiel.schlagwoerter = [];
            }
        });
        const spielSlice: Slice<Spiel> = {
            content: spiele,
            totalElements,
        };
        this.#logger.debug('createSlice: spielSlice=%o', spielSlice);
        return spielSlice;
    }

    #checkKeys(keys: string[]) {
        this.#logger.debug('#checkKeys: keys=%s', keys);
        // Ist jedes Suchkriterium auch eine Property von Spiel oder "schlagwoerter"?
        let validKeys = true;
        keys.forEach((key) => {
            if (
                !this.#spielProps.includes(key) &&
                key !== 'javascript' &&
                key !== 'typescript' &&
                key !== 'java' &&
                key !== 'python'
            ) {
                this.#logger.debug(
                    '#checkKeys: ungueltiges Suchkriterium "%s"',
                    key,
                );
                validKeys = false;
            }
        });

        return validKeys;
    }

    #checkEnums(suchkriterien: Suchkriterien) {
        const { art } = suchkriterien;
        this.#logger.debug('#checkEnums: Suchkriterium "art=%s"', art);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return (
            art === undefined ||
            art === 'EPUB' ||
            art === 'HARDCOVER' ||
            art === 'PAPERBACK'
        );
    }
}

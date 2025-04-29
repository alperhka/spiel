/* eslint-disable max-lines */
// Copyright (C) 2021 - present Juergen Zimmermann, Hochschule Karlsruhe
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
 * Das Modul besteht aus der Controller-Klasse für Schreiben an der REST-Schnittstelle.
 * @packageDocumentation
 */

import {
    Body,
    Controller,
    Delete,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiHeader,
    ApiNoContentResponse,
    ApiOperation,
    ApiParam,
    ApiPreconditionFailedResponse,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { Express, Request, Response } from 'express';
import { AuthGuard, Public, Roles } from 'nest-keycloak-connect';
import { paths } from '../../config/paths.js';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { type Bild } from '../entity/bild.entity.js';
import { type Spiel } from '../entity/spiel.entity.js';
import { type Name } from '../entity/name.entity.js';
import { SpielWriteService } from '../service/spiel-write.service.js';
import { SpielDTO, SpielDtoOhneRef } from './spielDTO.entity.js';
import { createBaseUri } from './createBaseUri.js';

const MSG_FORBIDDEN = 'Kein Token mit ausreichender Berechtigung vorhanden';
/**
 * Die Controller-Klasse für die Verwaltung von Bücher.
 */
@Controller(paths.rest)
@UseGuards(AuthGuard)
@UseInterceptors(ResponseTimeInterceptor)
@ApiTags('Spiel REST-API')
@ApiBearerAuth()
export class SpielWriteController {
    readonly #service: SpielWriteService;

    readonly #logger = getLogger(SpielWriteController.name);

    constructor(service: SpielWriteService) {
        this.#service = service;
    }

    /**
     * Ein neues Spiel wird asynchron angelegt. Das neu anzulegende Spiel ist als
     * JSON-Datensatz im Request-Objekt enthalten. Wenn es keine
     * Verletzungen von Constraints gibt, wird der Statuscode `201` (`Created`)
     * gesetzt und im Response-Header wird `Location` auf die URI so gesetzt,
     * dass damit das neu angelegte Spiel abgerufen werden kann.
     *
     * Falls Constraints verletzt sind, wird der Statuscode `400` (`Bad Request`)
     * gesetzt und genauso auch wenn der Name oder die BARCODE-Nummer bereits
     * existieren.
     *
     * @param spielDTO JSON-Daten für ein Spiel im Request-Body.
     * @param req: Request-Objekt von Express für den Location-Header.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    @Post()
    @Roles({ roles: ['admin', 'user'] })
    @ApiOperation({ summary: 'Ein neues Spiel anlegen' })
    @ApiCreatedResponse({ description: 'Erfolgreich neu angelegt' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Spieldaten' })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async post(
        @Body() spielDTO: SpielDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug('post: spielDTO=%o', spielDTO);

        const spiel = this.#spielDtoToSpiel(spielDTO);
        const id = await this.#service.create(spiel);

        const location = `${createBaseUri(req)}/${id}`;
        this.#logger.debug('post: location=%s', location);
        return res.location(location).send();
    }

    /**
     * Zu einem gegebenen Spiel wird eine Binärdatei, z.B. ein Bild, hochgeladen.
     * Nest realisiert File-Upload mit POST.
     * https://docs.nestjs.com/techniques/file-upload.
     * Postman: Body mit "form-data", key: "file" und "File" im Dropdown-Menü
     * @param id ID des vorhandenen Spieles
     * @param file Binärdatei als `File`-Objekt von _Multer_.
     * @param req: Request-Objekt von Express für den Location-Header.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    // eslint-disable-next-line max-params
    @Post(':id')
    @Public()
    // @Roles({ roles: ['admin']})
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Binärdatei mit einem Bild hochladen' })
    @ApiParam({
        name: 'id',
        description: 'Z.B. 1',
    })
    @ApiCreatedResponse({ description: 'Erfolgreich hinzugefügt' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Datei' })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    @UseInterceptors(FileInterceptor('file'))
    async addFile(
        @Param(
            'id',
            new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
        )
        id: number,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug(
            'addFile: id: %d, originalname=%s, mimetype=%s',
            id,
            file.originalname,
            file.mimetype,
        );

        // TODO Dateigroesse pruefen

        await this.#service.addFile(
            id,
            file.buffer,
            file.originalname,
            file.mimetype,
        );

        const location = `${createBaseUri(req)}/file/${id}`;
        this.#logger.debug('addFile: location=%s', location);
        return res.location(location).send();
    }

    /**
     * Ein vorhandenes Spiel wird asynchron aktualisiert.
     *
     * Im Request-Objekt von Express muss die ID des zu aktualisierenden Spieles
     * als Pfad-Parameter enthalten sein. Außerdem muss im Rumpf das zu
     * aktualisierende Spiel als JSON-Datensatz enthalten sein. Damit die
     * Aktualisierung überhaupt durchgeführt werden kann, muss im Header
     * `If-Match` auf die korrekte Version für optimistische Synchronisation
     * gesetzt sein.
     *
     * Bei erfolgreicher Aktualisierung wird der Statuscode `204` (`No Content`)
     * gesetzt und im Header auch `ETag` mit der neuen Version mitgeliefert.
     *
     * Falls die Versionsnummer fehlt, wird der Statuscode `428` (`Precondition
     * required`) gesetzt; und falls sie nicht korrekt ist, der Statuscode `412`
     * (`Precondition failed`). Falls Constraints verletzt sind, wird der
     * Statuscode `400` (`Bad Request`) gesetzt und genauso auch wenn der neue
     * Name oder die neue BARCODE-Nummer bereits existieren.
     *
     * @param spielDTO Spieldaten im Body des Request-Objekts.
     * @param id Pfad-Paramater für die ID.
     * @param version Versionsnummer aus dem Header _If-Match_.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    // eslint-disable-next-line max-params
    @Put(':id')
    @Roles({ roles: ['admin', 'user'] })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Ein vorhandenes Spiel aktualisieren' })
    @ApiHeader({
        name: 'If-Match',
        description: 'Header für optimistische Synchronisation',
        required: false,
    })
    @ApiNoContentResponse({ description: 'Erfolgreich aktualisiert' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Spieldaten' })
    @ApiPreconditionFailedResponse({
        description: 'Falsche Version im Header "If-Match"',
    })
    @ApiResponse({
        status: HttpStatus.PRECONDITION_REQUIRED,
        description: 'Header "If-Match" fehlt',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async put(
        @Body() spielDTO: SpielDtoOhneRef,
        @Param(
            'id',
            new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
        )
        id: number,
        @Headers('If-Match') version: string | undefined,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug(
            'put: id=%s, spielDTO=%o, version=%s',
            id,
            spielDTO,
            version,
        );

        if (version === undefined) {
            const msg = 'Header "If-Match" fehlt';
            this.#logger.debug('put: msg=%s', msg);
            return res
                .status(HttpStatus.PRECONDITION_REQUIRED)
                .set('Content-Type', 'application/json')
                .send(msg);
        }

        const spiel = this.#spielDtoOhneRefToSpiel(spielDTO);
        const neueVersion = await this.#service.update({ id, spiel, version });
        this.#logger.debug('put: version=%d', neueVersion);
        return res.header('ETag', `"${neueVersion}"`).send();
    }

    /**
     * Ein Spiel wird anhand seiner ID-gelöscht, die als Pfad-Parameter angegeben
     * ist. Der zurückgelieferte Statuscode ist `204` (`No Content`).
     *
     * @param id Pfad-Paramater für die ID.
     * @returns Leeres Promise-Objekt.
     */
    @Delete(':id')
    @Roles({ roles: ['admin'] })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Spiel mit der ID löschen' })
    @ApiNoContentResponse({
        description: 'Das Spiel wurde gelöscht oder war nicht vorhanden',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async delete(@Param('id') id: number) {
        this.#logger.debug('delete: id=%s', id);
        await this.#service.delete(id);
    }

    #spielDtoToSpiel(spielDTO: SpielDTO): Spiel {
        const nameDTO = spielDTO.name;
        const name: Name = {
            id: undefined,
            name: nameDTO.name,
            untertitel: nameDTO.untertitel,
            spiel: undefined,
        };
        const bilder = spielDTO.bilder?.map((bildDTO) => {
            const bild: Bild = {
                id: undefined,
                beschriftung: bildDTO.beschriftung,
                contentType: bildDTO.contentType,
                spiel: undefined,
            };
            return bild;
        });
        const spiel = {
            id: undefined,
            version: undefined,
            barcode: spielDTO.barcode,
            rating: spielDTO.rating,
            art: spielDTO.art,
            preis: Decimal(spielDTO.preis),
            rabatt: Decimal(spielDTO.rabatt ?? '0'),
            lieferbar: spielDTO.lieferbar,
            datum: spielDTO.datum,
            homepage: spielDTO.homepage,
            schlagwoerter: spielDTO.schlagwoerter,
            name,
            bilder,
            file: undefined,
            erzeugt: new Date(),
            aktualisiert: new Date(),
        };

        // Rueckwaertsverweise
        spiel.name.spiel = spiel;
        spiel.bilder?.forEach((bild) => {
            bild.spiel = spiel;
        });
        return spiel;
    }

    #spielDtoOhneRefToSpiel(spielDTO: SpielDtoOhneRef): Spiel {
        return {
            id: undefined,
            version: undefined,
            barcode: spielDTO.barcode,
            rating: spielDTO.rating,
            art: spielDTO.art,
            preis: Decimal(spielDTO.preis),
            rabatt: Decimal(spielDTO.rabatt ?? '0'),
            lieferbar: spielDTO.lieferbar,
            datum: spielDTO.datum,
            homepage: spielDTO.homepage,
            schlagwoerter: spielDTO.schlagwoerter,
            name: undefined,
            bilder: undefined,
            file: undefined,
            erzeugt: undefined,
            aktualisiert: new Date(),
        };
    }
}
/* eslint-enable max-lines */

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

// eslint-disable-next-line max-classes-per-file
import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { IsInt, IsNumberString, Min } from 'class-validator';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import { AuthGuard, Roles } from 'nest-keycloak-connect';
import { getLogger } from '../../logger/logger.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { SpielDTO } from '../controller/spielDTO.entity.js';
import { type Bild } from '../entity/bild.entity.js';
import { type Spiel } from '../entity/spiel.entity.js';
import { type Name } from '../entity/name.entity.js';
import { SpielWriteService } from '../service/spiel-write.service.js';
import { type IdInput } from './spiel-query.resolver.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

// Authentifizierung und Autorisierung durch
//  GraphQL Shield
//      https://www.graphql-shield.com
//      https://github.com/maticzav/graphql-shield
//      https://github.com/nestjs/graphql/issues/92
//      https://github.com/maticzav/graphql-shield/issues/213
//  GraphQL AuthZ
//      https://github.com/AstrumU/graphql-authz
//      https://www.the-guild.dev/blog/graphql-authz

export type CreatePayload = {
    readonly id: number;
};

export type UpdatePayload = {
    readonly version: number;
};

export class SpielUpdateDTO extends SpielDTO {
    @IsNumberString()
    readonly id!: string;

    @IsInt()
    @Min(0)
    readonly version!: number;
}
@Resolver('Spiel')
// alternativ: globale Aktivierung der Guards https://docs.nestjs.com/security/authorization#basic-rbac-implementation
@UseGuards(AuthGuard)
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseTimeInterceptor)
export class SpielMutationResolver {
    readonly #service: SpielWriteService;

    readonly #logger = getLogger(SpielMutationResolver.name);

    constructor(service: SpielWriteService) {
        this.#service = service;
    }

    @Mutation()
    @Roles('admin', 'user')
    async create(@Args('input') spielDTO: SpielDTO) {
        this.#logger.debug('create: spielDTO=%o', spielDTO);

        const spiel = this.#spielDtoToSpiel(spielDTO);
        const id = await this.#service.create(spiel);
        this.#logger.debug('createSpiel: id=%d', id);
        const payload: CreatePayload = { id };
        return payload;
    }

    @Mutation()
    @Roles('admin', 'user')
    async update(@Args('input') spielDTO: SpielUpdateDTO) {
        this.#logger.debug('update: spiel=%o', spielDTO);

        const spiel = this.#spielUpdateDtoToSpiel(spielDTO);
        const versionStr = `"${spielDTO.version.toString()}"`;

        const versionResult = await this.#service.update({
            id: Number.parseInt(spielDTO.id, 10),
            spiel,
            version: versionStr,
        });
        // TODO BadUserInputError
        this.#logger.debug('updateSpiel: versionResult=%d', versionResult);
        const payload: UpdatePayload = { version: versionResult };
        return payload;
    }

    @Mutation()
    @Roles('admin')
    async delete(@Args() id: IdInput) {
        const idStr = id.id;
        this.#logger.debug('delete: id=%s', idStr);
        const deletePerformed = await this.#service.delete(idStr);
        this.#logger.debug('deleteSpiel: deletePerformed=%s', deletePerformed);
        return deletePerformed;
    }

    #spielDtoToSpiel(spielDTO: SpielDTO): Spiel {
        const nameDTO = spielDTO.name;
        const name: Name = {
            id: undefined,
            name: nameDTO.name,
            untertitel: nameDTO.untertitel,
            spiel: undefined,
        };
        // "Optional Chaining" ab ES2020
        const bilder = spielDTO.bilder?.map((bildDTO) => {
            const bild: Bild = {
                id: undefined,
                beschriftung: bildDTO.beschriftung,
                contentType: bildDTO.contentType,
                spiel: undefined,
            };
            return bild;
        });
        const spiel: Spiel = {
            id: undefined,
            version: undefined,
            barcode: spielDTO.barcode,
            rating: spielDTO.rating,
            art: spielDTO.art,
            preis: Decimal(spielDTO.preis),
            rabatt: Decimal(spielDTO.rabatt ?? ''),
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

        // Rueckwaertsverweis
        spiel.name!.spiel = spiel;
        return spiel;
    }

    #spielUpdateDtoToSpiel(spielDTO: SpielUpdateDTO): Spiel {
        return {
            id: undefined,
            version: undefined,
            barcode: spielDTO.barcode,
            rating: spielDTO.rating,
            art: spielDTO.art,
            preis: Decimal(spielDTO.preis),
            rabatt: Decimal(spielDTO.rabatt ?? ''),
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

    // #errorMsgCreateSpiel(err: CreateError) {
    //     switch (err.type) {
    //         case 'barcodeExists': {
    //             return `Der barcode ${err.barcode} existiert bereits`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }

    // #errorMsgUpdateSpiel(err: UpdateError) {
    //     switch (err.type) {
    //         case 'SpielNotExists': {
    //             return `Es gibt kein Spiel mit der ID ${err.id}`;
    //         }
    //         case 'VersionInvalid': {
    //             return `"${err.version}" ist keine gueltige Versionsnummer`;
    //         }
    //         case 'VersionOutdated': {
    //             return `Die Versionsnummer "${err.version}" ist nicht mehr aktuell`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }
}

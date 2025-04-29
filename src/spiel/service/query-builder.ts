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
 * Das Modul besteht aus der Klasse {@linkcode QueryBuilder}.
 * @packageDocumentation
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { typeOrmModuleOptions } from '../../config/typeormOptions.js';
import { getLogger } from '../../logger/logger.js';
import { Bild } from '../entity/bild.entity.js';
import { Spiel } from '../entity/spiel.entity.js';
import { DEFAULT_PAGE_NUMBER, DEFAULT_PAGE_SIZE } from './pageable.js';
import { type Pageable } from './pageable.js';
import { Name } from '../entity/name.entity.js';
import { type Suchkriterien } from './suchkriterien.js';

/** Typdefinitionen für die Suche mit der Spiel-ID. */
export type BuildIdParams = {
    /** ID des gesuchten Spiels. */
    readonly id: number;
    /** Sollen die Bilder mitgeladen werden? */
    readonly mitBilder?: boolean;
};
/**
 * Die Klasse `QueryBuilder` implementiert das Lesen für Bücher und greift
 * mit _TypeORM_ auf eine relationale DB zu.
 */
@Injectable()
export class QueryBuilder {
    readonly #spielAlias = `${Spiel.name
        .charAt(0)
        .toLowerCase()}${Spiel.name.slice(1)}`;

    readonly #nameAlias = `${Name.name
        .charAt(0)
        .toLowerCase()}${Name.name.slice(1)}`;

    readonly #bildAlias = `${Bild.name
        .charAt(0)
        .toLowerCase()}${Bild.name.slice(1)}`;

    readonly #repo: Repository<Spiel>;

    readonly #logger = getLogger(QueryBuilder.name);

    constructor(@InjectRepository(Spiel) repo: Repository<Spiel>) {
        this.#repo = repo;
    }

    /**
     * Ein Spiel mit der ID suchen.
     * @param id ID des gesuchten Spieles
     * @returns QueryBuilder
     */
    buildId({ id, mitBilder = false }: BuildIdParams) {
        // QueryBuilder "spiel" fuer Repository<Spiel>
        const queryBuilder = this.#repo.createQueryBuilder(this.#spielAlias);

        // Fetch-Join: aus QueryBuilder "spiel" die Property "name" ->  Tabelle "name"
        queryBuilder.innerJoinAndSelect(
            `${this.#spielAlias}.name`,
            this.#nameAlias,
        );

        if (mitBilder) {
            // Fetch-Join: aus QueryBuilder "spiel" die Property "Bilder" -> Tabelle "bild"
            queryBuilder.leftJoinAndSelect(
                `${this.#spielAlias}.bilder`,
                this.#bildAlias,
            );
        }

        queryBuilder.where(`${this.#spielAlias}.id = :id`, { id: id }); // eslint-disable-line object-shorthand
        return queryBuilder;
    }

    /**
     * Bücher asynchron suchen.
     * @param suchkriterien JSON-Objekt mit Suchkriterien. Bei "name" wird mit
     * einem Teilstring gesucht, bei "rating" mit einem Mindestwert, bei "preis"
     * mit der Obergrenze.
     * @param pageable Maximale Anzahl an Datensätzen und Seitennummer.
     * @returns QueryBuilder
     */
    // z.B. { name: 'a', rating: 5, preis: 22.5, javascript: true }
    // "rest properties" fuer anfaengliche WHERE-Klausel: ab ES 2018 https://github.com/tc39/proposal-object-rest-spread
    // eslint-disable-next-line max-lines-per-function, prettier/prettier, sonarjs/cognitive-complexity
    build(
        {
            // NOSONAR
            name,
            rating,
            preis,
            javascript,
            typescript,
            java,
            python,
            ...restProps
        }: Suchkriterien,
        pageable: Pageable,
    ) {
        this.#logger.debug(
            'build: name=%s, rating=%s, preis=%s, javascript=%s, typescript=%s, java=%s, python=%s, restProps=%o, pageable=%o',
            name,
            rating,
            preis,
            javascript,
            typescript,
            java,
            python,
            restProps,
            pageable,
        );

        let queryBuilder = this.#repo.createQueryBuilder(this.#spielAlias);
        queryBuilder.innerJoinAndSelect(`${this.#spielAlias}.name`, 'name');

        // z.B. { name: 'a', rating: 5, javascript: true }
        // "rest properties" fuer anfaengliche WHERE-Klausel: ab ES 2018 https://github.com/tc39/proposal-object-rest-spread
        // type-coverage:ignore-next-line
        // const { name, javascript, typescript, ...otherProps } = suchkriterien;

        let useWhere = true;

        // Name in der Query: Teilstring des Namens und "case insensitive"
        // CAVEAT: MySQL hat keinen Vergleich mit "case insensitive"
        // type-coverage:ignore-next-line
        if (name !== undefined && typeof name === 'string') {
            const ilike =
                typeOrmModuleOptions.type === 'postgres' ? 'ilike' : 'like';
            queryBuilder = queryBuilder.where(
                `${this.#nameAlias}.name ${ilike} :name`,
                { name: `%${name}%` },
            );
            useWhere = false;
        }

        if (rating !== undefined) {
            const ratingNumber =
                typeof rating === 'string' ? parseInt(rating) : rating;
            if (!isNaN(ratingNumber)) {
                queryBuilder = queryBuilder.where(
                    `${this.#spielAlias}.rating >= ${ratingNumber}`,
                );
                useWhere = false;
            }
        }

        if (preis !== undefined && typeof preis === 'string') {
            const preisNumber = Number(preis);
            queryBuilder = queryBuilder.where(
                `${this.#spielAlias}.preis <= ${preisNumber}`,
            );
            useWhere = false;
        }

        if (javascript === 'true') {
            queryBuilder = useWhere
                ? queryBuilder.where(
                      `${this.#spielAlias}.schlagwoerter like '%JAVASCRIPT%'`,
                  )
                : queryBuilder.andWhere(
                      `${this.#spielAlias}.schlagwoerter like '%JAVASCRIPT%'`,
                  );
            useWhere = false;
        }

        if (typescript === 'true') {
            queryBuilder = useWhere
                ? queryBuilder.where(
                      `${this.#spielAlias}.schlagwoerter like '%TYPESCRIPT%'`,
                  )
                : queryBuilder.andWhere(
                      `${this.#spielAlias}.schlagwoerter like '%TYPESCRIPT%'`,
                  );
            useWhere = false;
        }

        // Bei "JAVA" sollen Ergebnisse mit "JAVASCRIPT" _nicht_ angezeigt werden
        if (java === 'true') {
            queryBuilder = useWhere
                ? queryBuilder.where(
                      `REPLACE(${this.#spielAlias}.schlagwoerter, 'JAVASCRIPT', '') like '%JAVA%'`,
                  )
                : queryBuilder.andWhere(
                      `REPLACE(${this.#spielAlias}.schlagwoerter, 'JAVASCRIPT', '') like '%JAVA%'`,
                  );
            useWhere = false;
        }

        if (python === 'true') {
            queryBuilder = useWhere
                ? queryBuilder.where(
                      `${this.#spielAlias}.schlagwoerter like '%PYTHON%'`,
                  )
                : queryBuilder.andWhere(
                      `${this.#spielAlias}.schlagwoerter like '%PYTHON%'`,
                  );
            useWhere = false;
        }

        // Restliche Properties als Key-Value-Paare: Vergleiche auf Gleichheit
        Object.entries(restProps).forEach(([key, value]) => {
            const param: Record<string, any> = {};
            param[key] = value; // eslint-disable-line security/detect-object-injection
            queryBuilder = useWhere
                ? queryBuilder.where(
                      `${this.#spielAlias}.${key} = :${key}`,
                      param,
                  )
                : queryBuilder.andWhere(
                      `${this.#spielAlias}.${key} = :${key}`,
                      param,
                  );
            useWhere = false;
        });

        this.#logger.debug('build: sql=%s', queryBuilder.getSql());

        if (pageable?.size === 0) {
            return queryBuilder;
        }
        const size = pageable?.size ?? DEFAULT_PAGE_SIZE;
        const number = pageable?.number ?? DEFAULT_PAGE_NUMBER;
        const skip = number * size;
        this.#logger.debug('take=%s, skip=%s', size, skip);
        return queryBuilder.take(size).skip(skip);
    }
}

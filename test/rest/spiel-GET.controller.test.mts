// Copyright (C) 2025 - present Juergen Zimmermann, Hochschule Karlsruhe
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

import { beforeAll, describe, expect, test } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { Decimal } from 'decimal.js';
import { type Spiel } from '../../src/spiel/entity/spiel.entity.js';
import { type Page } from '../../src/spiel/controller/page.js';
import { baseURL, httpsAgent } from '../constants.mjs';
import { type ErrorResponse } from './error-response.mjs';

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const titelVorhanden = 'a';
const titelNichtVorhanden = 'xx';
const ratingMin = 3;
const preisMax = 33.5;
const schlagwortVorhanden = 'javascript';
const schlagwortNichtVorhanden = 'csharp';

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
describe('GET /rest', () => {
    let restUrl: string;
    let client: AxiosInstance;

    // Axios initialisieren
    beforeAll(async () => {
        restUrl = `${baseURL}/rest`;
        client = axios.create({
            baseURL: restUrl,
            httpsAgent,
            validateStatus: () => true,
        });
    });

    test.concurrent('Alle Spiele', async () => {
        // given

        // when
        const { status, headers, data }: AxiosResponse<Page<Spiel>> =
            await client.get('/');

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data).toBeDefined();

        data.content
            .map((spiel) => spiel.id)
            .forEach((id) => {
                expect(id).toBeDefined();
            });
    });

    test.concurrent('Spiele mit einem Teil-Name suchen', async () => {
        // given
        const params = { name: titelVorhanden };

        // when
        const { status, headers, data }: AxiosResponse<Page<Spiel>> =
            await client.get('/', { params });

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data).toBeDefined();

        // Jedes Spiel hat einen Name mit dem Teilstring 'a'
        data.content
            .map((spiel) => spiel.name)
            .forEach((name) =>
                expect(name?.name?.toLowerCase()).toStrictEqual(
                    expect.stringContaining(titelVorhanden),
                ),
            );
    });

    test.concurrent(
        'Spiele zu einem nicht vorhandenen Teil-Name suchen',
        async () => {
            // given
            const params = { name: titelNichtVorhanden };

            // when
            const { status, data }: AxiosResponse<ErrorResponse> =
                await client.get('/', { params });

            // then
            expect(status).toBe(HttpStatus.NOT_FOUND);

            const { error, statusCode } = data;

            expect(error).toBe('Not Found');
            expect(statusCode).toBe(HttpStatus.NOT_FOUND);
        },
    );

    test.concurrent('Spiele mit Mindest-"rating" suchen', async () => {
        // given
        const params = { rating: ratingMin };

        // when
        const { status, headers, data }: AxiosResponse<Page<Spiel>> =
            await client.get('/', { params });

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data).toBeDefined();

        // Jedes Spiel hat einen Name mit dem Teilstring 'a'
        data.content
            .map((spiel) => spiel.rating)
            .forEach((rating) =>
                expect(rating).toBeGreaterThanOrEqual(ratingMin),
            );
    });

    test.concurrent('Spiele mit max. Preis suchen', async () => {
        // given
        const params = { preis: preisMax };

        // when
        const { status, headers, data }: AxiosResponse<Page<Spiel>> =
            await client.get('/', { params });

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data).toBeDefined();

        // Jedes Spiel hat einen Name mit dem Teilstring 'a'
        data.content
            .map((spiel) => Decimal(spiel?.preis ?? 0))
            .forEach((preis) =>
                expect(preis.lessThanOrEqualTo(Decimal(preisMax))).toBe(true),
            );
    });

    test.concurrent('Mind. 1 Spiel mit vorhandenem Schlagwort', async () => {
        // given
        const params = { [schlagwortVorhanden]: 'true' };

        // when
        const { status, headers, data }: AxiosResponse<Page<Spiel>> =
            await client.get('/', { params });

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        // JSON-Array mit mind. 1 JSON-Objekt
        expect(data).toBeDefined();

        // Jedes Spiel hat im Array der Schlagwoerter z.B. "javascript"
        data.content
            .map((spiel) => spiel.schlagwoerter)
            .forEach((schlagwoerter) =>
                expect(schlagwoerter).toStrictEqual(
                    expect.arrayContaining([schlagwortVorhanden.toUpperCase()]),
                ),
            );
    });

    test.concurrent(
        'Keine Spiele zu einem nicht vorhandenen Schlagwort',
        async () => {
            // given
            const params = { [schlagwortNichtVorhanden]: 'true' };

            // when
            const { status, data }: AxiosResponse<ErrorResponse> =
                await client.get('/', { params });

            // then
            expect(status).toBe(HttpStatus.NOT_FOUND);

            const { error, statusCode } = data;

            expect(error).toBe('Not Found');
            expect(statusCode).toBe(HttpStatus.NOT_FOUND);
        },
    );

    test.concurrent(
        'Keine Spiele zu einer nicht-vorhandenen Property',
        async () => {
            // given
            const params = { foo: 'bar' };

            // when
            const { status, data }: AxiosResponse<ErrorResponse> =
                await client.get('/', { params });

            // then
            expect(status).toBe(HttpStatus.NOT_FOUND);

            const { error, statusCode } = data;

            expect(error).toBe('Not Found');
            expect(statusCode).toBe(HttpStatus.NOT_FOUND);
        },
    );
});

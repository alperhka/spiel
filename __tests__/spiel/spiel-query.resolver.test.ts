/* eslint-disable max-lines, @typescript-eslint/no-non-null-assertion */
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

import { type GraphQLRequest } from '@apollo/server';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import {
    type Spiel,
    type SpielArt,
} from '../../src/spiel/entity/spiel.entity.js';
import { type GraphQLResponseBody } from '../graphql.js';
import {
    host,
    httpsAgent,
    port,
    shutdownServer,
    startServer,
} from '../testserver.js';

type SpielDTO = Omit<
    Spiel,
    'bilder' | 'aktualisiert' | 'erzeugt' | 'rabatt'
> & {
    rabatt: string;
};

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const idVorhanden = '1';

const nameVorhanden = 'Alpha';
const teilNameVorhanden = 'a';
const teilNameNichtVorhanden = 'abc';

const barcodeVorhanden = '978-3-897-22583-1';

const ratingMin = 3;
const ratingNichtVorhanden = 99;

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
// eslint-disable-next-line max-lines-per-function
describe('GraphQL Queries', () => {
    let client: AxiosInstance;
    const graphqlPath = 'graphql';

    // Testserver starten und dabei mit der DB verbinden
    beforeAll(async () => {
        await startServer();
        const baseURL = `https://${host}:${port}/`;
        client = axios.create({
            baseURL,
            httpsAgent,
            // auch Statuscode 400 als gueltigen Request akzeptieren, wenn z.B.
            // ein Enum mit einem falschen String getestest wird
            validateStatus: () => true,
        });
    });

    afterAll(async () => {
        await shutdownServer();
    });

    test('Spiel zu vorhandener ID', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiel(id: "${idVorhanden}") {
                        version
                        barcode
                        rating
                        art
                        preis
                        lieferbar
                        datum
                        homepage
                        schlagwoerter
                        name {
                            name
                        }
                        rabatt(short: true)
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { spiel } = data.data! as { spiel: SpielDTO };

        expect(spiel.name?.name).toMatch(/^\w/u);
        expect(spiel.version).toBeGreaterThan(-1);
        expect(spiel.id).toBeUndefined();
    });

    test('Spiel zu nicht-vorhandener ID', async () => {
        // given
        const id = '999999';
        const body: GraphQLRequest = {
            query: `
                {
                    spiel(id: "${id}") {
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.spiel).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toBe(`Es gibt kein Spiel mit der ID ${id}.`);
        expect(path).toBeDefined();
        expect(path![0]).toBe('spiel');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Spiel zu vorhandenem Name', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        name: "${nameVorhanden}"
                    }) {
                        art
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { spiele } = data.data! as { spiele: SpielDTO[] };

        expect(spiele).not.toHaveLength(0);
        expect(spiele).toHaveLength(1);

        const [spiel] = spiele;

        expect(spiel!.name?.name).toBe(nameVorhanden);
    });

    test('Spiel zu vorhandenem Teil-Name', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        name: "${teilNameVorhanden}"
                    }) {
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { spiele } = data.data! as { spiele: SpielDTO[] };

        expect(spiele).not.toHaveLength(0);

        spiele
            .map((spiel) => spiel.name)
            .forEach((name) =>
                expect(name?.name.toLowerCase()).toEqual(
                    expect.stringContaining(teilNameVorhanden),
                ),
            );
    });

    test('Spiel zu nicht vorhandenem Name', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        name: "${teilNameNichtVorhanden}"
                    }) {
                        art
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.spiele).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Spiele gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('spiele');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Spiel zu vorhandener BARCODE-Nummer', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        barcode: "${barcodeVorhanden}"
                    }) {
                        barcode
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { spiele } = data.data! as { spiele: SpielDTO[] };

        expect(spiele).not.toHaveLength(0);
        expect(spiele).toHaveLength(1);

        const [spiel] = spiele;
        const { barcode, name } = spiel!;

        expect(barcode).toBe(barcodeVorhanden);
        expect(name?.name).toBeDefined();
    });

    test('Spiele mit Mindest-"rating"', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        rating: ${ratingMin},
                        name: "${teilNameVorhanden}"
                    }) {
                        rating
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();

        expect(data.data).toBeDefined();

        const { spiele } = data.data! as { spiele: SpielDTO[] };

        expect(spiele).not.toHaveLength(0);

        spiele.forEach((spiel) => {
            const { rating, name } = spiel;

            expect(rating).toBeGreaterThanOrEqual(ratingMin);
            expect(name?.name.toLowerCase()).toEqual(
                expect.stringContaining(teilNameVorhanden),
            );
        });
    });

    test('Kein Spiel zu nicht-vorhandenem "rating"', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        rating: ${ratingNichtVorhanden}
                    }) {
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.spiele).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Spiele gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('spiele');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Spiele zur Art "EPUB"', async () => {
        // given
        const spielArt: SpielArt = 'EPUB';
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        art: ${spielArt}
                    }) {
                        art
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { spiele } = data.data! as { spiele: SpielDTO[] };

        expect(spiele).not.toHaveLength(0);

        spiele.forEach((spiel) => {
            const { art, name } = spiel;

            expect(art).toBe(spielArt);
            expect(name?.name).toBeDefined();
        });
    });

    test('Spiele zur einer ungueltigen Art', async () => {
        // given
        const spielArt = 'UNGUELTIG';
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        art: ${spielArt}
                    }) {
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.BAD_REQUEST);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data).toBeUndefined();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { extensions } = error;

        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('GRAPHQL_VALIDATION_FAILED');
    });

    test('Spiele mit lieferbar=true', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    spiele(suchkriterien: {
                        lieferbar: true
                    }) {
                        lieferbar
                        name {
                            name
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { spiele } = data.data! as { spiele: SpielDTO[] };

        expect(spiele).not.toHaveLength(0);

        spiele.forEach((spiel) => {
            const { lieferbar, name } = spiel;

            expect(lieferbar).toBe(true);
            expect(name?.name).toBeDefined();
        });
    });
});

/* eslint-enable max-lines, , @typescript-eslint/no-non-null-assertion */

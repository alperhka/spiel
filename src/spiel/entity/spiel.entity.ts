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

// Nest unterstützt verschiedene Werkzeuge fuer OR-Mapping
// https://docs.nestjs.com/techniques/database
//  * TypeORM     https://typeorm.io
//  * Sequelize   https://sequelize.org
//  * Knex        https://knexjs.org

// TypeORM unterstützt die Patterns
//  * "Data Mapper" und orientiert sich an Hibernate (Java), Doctrine (PHP) und Entity Framework (C#)
//  * "Active Record" und orientiert sich an Mongoose (JavaScript)

// TypeORM unterstützt u.a. die DB-Systeme
//  * Postgres
//  * MySQL
//  * SQLite durch sqlite3 und better-sqlite3
//  * Oracle
//  * Microsoft SQL Server
//  * SAP Hana
//  * Cloud Spanner von Google

/**
 * Das Modul besteht aus der Entity-Klasse.
 * @packageDocumentation
 */

import { ApiProperty } from '@nestjs/swagger';
import Decimal from 'decimal.js'; // eslint-disable-line @typescript-eslint/naming-convention
import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import { dbType } from '../../config/db.js';
import { Bild } from './bild.entity.js';
import { SpielFile } from './spielFile.entity.js';
import { DecimalTransformer } from './decimal-transformer.js';
import { Name } from './name.entity.js';

/**
 * Alias-Typ für gültige Strings bei der Art eines Spieles.
 */
export type SpielArt = 'BRETTSPIEL' | 'COMPUTERSPIEL' | 'ACTIONSPIEL';

/**
 * Entity-Klasse zu einer relationalen Tabelle.
 * BEACHTE: Jede Entity-Klasse muss in einem JSON-Array deklariert sein, das in
 * TypeOrmModule.forFeature(...) verwendet wird.
 * Im Beispiel ist das JSON-Array in src\spiel\entity\entities.ts und
 * TypeOrmModule.forFeature(...) wird in src\spiel\spiel.module.ts aufgerufen.
 */
// https://typeorm.io/entities
@Entity()
export class Spiel {
    // https://typeorm.io/entities#primary-columns
    // default: strategy = 'increment' (SEQUENCE, GENERATED ALWAYS AS IDENTITY, AUTO_INCREMENT)
    @PrimaryGeneratedColumn()
    id: number | undefined;

    @VersionColumn()
    readonly version: number | undefined;

    @Column('varchar')
    @ApiProperty({ example: '0-0070-0644-6', type: String })
    readonly barcode!: string;

    @Column('int')
    @ApiProperty({ example: 5, type: Number })
    readonly rating: number | undefined;

    @Column('varchar')
    @ApiProperty({ example: 'BRETTSPIEL', type: String })
    readonly art: SpielArt | undefined;

    // TypeORM liest Gleitkommazahlen als String: Rundungsfehler vermeiden
    @Column('decimal', {
        precision: 8,
        scale: 2,
        // https://typeorm.io/entities#column-options
        transformer: new DecimalTransformer(),
    })
    @ApiProperty({ example: 1, type: Number })
    // Decimal aus decimal.js analog zu BigDecimal von Java
    readonly preis!: Decimal;

    @Column('decimal', {
        precision: 4,
        scale: 3,
        transformer: new DecimalTransformer(),
    })
    @ApiProperty({ example: 0.1, type: Number })
    readonly rabatt: Decimal | undefined;

    @Column('decimal') // TypeORM unterstuetzt bei Oracle *NICHT* den Typ boolean
    @ApiProperty({ example: true, type: Boolean })
    readonly lieferbar: boolean | undefined;

    @Column('date')
    @ApiProperty({ example: '2021-01-31' })
    // TypeORM unterstuetzt *NICHT* das Temporal-API (ES2022)
    readonly datum: Date | string | undefined;

    @Column('varchar')
    @ApiProperty({ example: 'https://test.de/', type: String })
    readonly homepage: string | undefined;

    // https://typeorm.io/entities#simple-array-column-type
    // nicht "readonly": null ersetzen durch []
    @Column('simple-array')
    schlagwoerter: string[] | null | undefined;

    // undefined wegen Updates
    @OneToOne(() => Name, (name) => name.spiel, {
        cascade: ['insert', 'remove'],
    })
    readonly name: Name | undefined;

    // undefined wegen Updates
    @OneToMany(() => Bild, (bild) => bild.spiel, {
        cascade: ['insert', 'remove'],
    })
    readonly bilder: Bild[] | undefined;

    @OneToOne(() => SpielFile, (spielFile) => spielFile.spiel, {
        cascade: ['insert', 'remove'],
    })
    readonly file: SpielFile | undefined;

    // https://typeorm.io/entities#special-columns
    // https://typeorm.io/entities#column-types-for-postgres
    // https://typeorm.io/entities#column-types-for-mysql--mariadb
    // https://typeorm.io/entities#column-types-for-sqlite--cordova--react-native--expo
    @CreateDateColumn({
        type: dbType === 'sqlite' ? 'datetime' : 'timestamp',
    })
    readonly erzeugt: Date | undefined;

    @UpdateDateColumn({
        type: dbType === 'sqlite' ? 'datetime' : 'timestamp',
    })
    readonly aktualisiert: Date | undefined;

    public toString = (): string =>
        JSON.stringify({
            id: this.id,
            version: this.version,
            barcode: this.barcode,
            rating: this.rating,
            art: this.art,
            preis: this.preis,
            rabatt: this.rabatt,
            lieferbar: this.lieferbar,
            datum: this.datum,
            homepage: this.homepage,
            schlagwoerter: this.schlagwoerter,
            erzeugt: this.erzeugt,
            aktualisiert: this.aktualisiert,
        });
}

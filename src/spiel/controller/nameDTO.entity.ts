// Copyright (C) 2023 - present Juergen Zimmermann, Hochschule Karlsruhe
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

/* eslint-disable @typescript-eslint/no-magic-numbers */

/**
 * Das Modul besteht aus der Entity-Klasse.
 * @packageDocumentation
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches, MaxLength } from 'class-validator';

/**
 * Entity-Klasse für Name ohne TypeORM.
 */
export class NameDTO {
    @Matches(String.raw`^\w.*`)
    @MaxLength(40)
    @ApiProperty({ example: 'Der Name', type: String })
    readonly name!: string;

    @IsOptional()
    @MaxLength(40)
    @ApiProperty({ example: 'Der Untertite', type: String })
    readonly untertitel: string | undefined;
}
/* eslint-enable @typescript-eslint/no-magic-numbers */

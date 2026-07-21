import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleExchangeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

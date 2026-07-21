import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;
}

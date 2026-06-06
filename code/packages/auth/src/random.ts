import { randomBytes } from "crypto";

export interface RandomNameGeneration {
    length: number;
    endsWith?: string;
}

export function generateRandomName(input: RandomNameGeneration): string {
    const { length, endsWith } = input;
    const randomPart = randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
    const suffix = endsWith != undefined ? endsWith : "";
    return randomPart + suffix;
}
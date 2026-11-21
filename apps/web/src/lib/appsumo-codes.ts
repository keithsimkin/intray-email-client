import hashFile from "../../data/appsumo-code-hashes.json";

type HashFile = {
  algo: string;
  count: number;
  hashes: string[];
};

const file = hashFile as HashFile;

const KNOWN_HASHES = new Set(file.hashes.map((hash) => hash.toLowerCase()));

export function appsumoHashFile(): HashFile {
  return file;
}

export function isKnownAppSumoHash(hash: string): boolean {
  return KNOWN_HASHES.has(hash.toLowerCase());
}

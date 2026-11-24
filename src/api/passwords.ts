import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface HashedPassword {
  senhaHash: string;
  senhaSalt: string;
  hashScheme: "scrypt-v1";
}

export async function hashPassword(senha: string): Promise<HashedPassword> {
  const senhaSalt = randomBytes(16).toString("base64url");
  const senhaHash = await deriveScryptHash(senha, senhaSalt);
  return { senhaHash, senhaSalt, hashScheme: "scrypt-v1" };
}

export async function verifyPassword(
  senha: string,
  senhaHash: string,
  senhaSalt: string,
  hashScheme: string,
): Promise<boolean> {
  let hashRecebido: Buffer;
  try {
    if (hashScheme === "scrypt-v1") {
      hashRecebido = Buffer.from(await deriveScryptHash(senha, senhaSalt), "base64url");
    } else if (hashScheme === "sha256-v1") {
      hashRecebido = createHash("sha256")
        .update(`${senhaSalt}:${senha}`, "utf8")
        .digest();
    } else {
      return false;
    }
  } catch (error) {
    throw new Error("Nao foi possivel verificar a credencial armazenada.", { cause: error });
  }

  const hashArmazenado = Buffer.from(senhaHash, hashScheme === "scrypt-v1" ? "base64url" : "hex");
  return (
    hashRecebido.length > 0 &&
    hashRecebido.length === hashArmazenado.length &&
    timingSafeEqual(hashRecebido, hashArmazenado)
  );
}

function deriveScryptHash(senha: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(senha, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("base64url"));
    });
  });
}

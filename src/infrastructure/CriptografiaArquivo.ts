import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export class CriptografiaArquivo {
  public cifrar(dados: string, chave: string): string {
    const vetorInicializacao = randomBytes(12);
    const cifra = createCipheriv(
      "aes-256-gcm",
      this.obterChave(chave),
      vetorInicializacao,
    );
    const conteudo = Buffer.concat([
      cifra.update(dados, "utf8"),
      cifra.final(),
    ]);
    const tag = cifra.getAuthTag();

    return [
      vetorInicializacao.toString("base64url"),
      tag.toString("base64url"),
      conteudo.toString("base64url"),
    ].join(".");
  }

  public decifrar(dadosCifrados: string, chave: string): string {
    const partes = dadosCifrados.split(".");

    if (partes.length !== 3) {
      throw new Error("Dados cifrados possuem formato invalido.");
    }

    const ivCodificado = partes[0];
    const tagCodificada = partes[1];
    const conteudoCodificado = partes[2];

    if (!ivCodificado || !tagCodificada || !conteudoCodificado) {
      throw new Error("Dados cifrados incompletos.");
    }

    const decifra = createDecipheriv(
      "aes-256-gcm",
      this.obterChave(chave),
      Buffer.from(ivCodificado, "base64url"),
    );
    decifra.setAuthTag(Buffer.from(tagCodificada, "base64url"));

    const conteudo = Buffer.concat([
      decifra.update(Buffer.from(conteudoCodificado, "base64url")),
      decifra.final(),
    ]);

    return conteudo.toString("utf8");
  }

  public gerarChave(): string {
    return randomBytes(32).toString("base64url");
  }

  private obterChave(chave: string): Buffer {
    const chaveBytes = Buffer.from(chave, "base64url");

    if (chaveBytes.length !== 32) {
      throw new Error("A chave deve possuir 256 bits.");
    }

    return chaveBytes;
  }
}

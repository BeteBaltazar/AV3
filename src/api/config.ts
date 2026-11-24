export interface ApiConfig {
  host: string;
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  databaseUrl: string;
}

export function carregarConfiguracaoApi(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const port = Number(environment.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT deve ser um numero inteiro entre 1 e 65535.");
  }

  const jwtSecret = environment.JWT_SECRET ?? "";
  if (Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET deve conter ao menos 32 bytes.");
  }

  const databaseUrl = environment.DATABASE_URL ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL e obrigatoria para iniciar a API.");
  }

  const jwtExpiresIn = environment.JWT_EXPIRES_IN ?? "30m";
  if (!/^[1-9]\d*(s|m|h|d)$/.test(jwtExpiresIn)) {
    throw new Error("JWT_EXPIRES_IN deve usar um formato como 30m ou 1h.");
  }

  return {
    host: environment.HOST ?? "0.0.0.0",
    port,
    jwtSecret,
    jwtExpiresIn,
    databaseUrl,
  };
}

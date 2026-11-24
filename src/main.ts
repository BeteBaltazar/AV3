import { existsSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import { stdin as entrada, stdout as saida } from "node:process";
import { Credencial } from "./security/Credencial.js";
import { PapelUsuario } from "./domain/enums/PapelUsuario.js";
import { CriptografiaArquivo } from "./infrastructure/CriptografiaArquivo.js";
import { Provisionamento } from "./infrastructure/Provisionamento.js";
import { criarAplicacao } from "./integration/ComposicaoAplicacao.js";

async function iniciar(): Promise<void> {
	const diretorioBase = process.env.GREENCODE_DATA_DIR ?? ".greencode";
	const caminhoConfiguracao = join(
		diretorioBase,
		"configuracao-mestre.json",
	);

	if (!existsSync(caminhoConfiguracao)) {
		await executarProvisionamento(diretorioBase);
	}

	const aplicacao = criarAplicacao(
		diretorioBase,
		PapelUsuario.ADMINISTRADOR,
	);
	aplicacao.cli.iniciarLoop();
}

async function executarProvisionamento(diretorioBase: string): Promise<void> {
	const interfaceLinha = readline.createInterface({
		input: entrada,
		output: saida,
	});
	const criptografia = new CriptografiaArquivo();
	const provisionamento = new Provisionamento(
		diretorioBase,
		criptografia,
		(usuario, senha) =>
			Credencial.criar(usuario, senha).paraPersistencia() as unknown as Record<
				string,
				unknown
			> & { id: string },
	);

	try {
		const usuario = await interfaceLinha.question("Primeiro administrador: ");
		const senha = await interfaceLinha.question("Senha: ");
		provisionamento.provisionar(usuario, () => senha);
		console.log("[SUCESSO] Provisionamento concluido.");
	} finally {
		interfaceLinha.close();
	}
}

iniciar().catch((erro: unknown) => {
	const mensagem = erro instanceof Error ? erro.message : "Erro inesperado.";
	console.error(`[ERRO] ${mensagem}`);
	process.exitCode = 1;
});

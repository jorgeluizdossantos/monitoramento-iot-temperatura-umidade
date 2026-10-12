export class HttpError extends Error {
  constructor(public readonly status: number, public readonly codigo: string, mensagem: string, public readonly campos: string[] = []) { super(mensagem); }
}

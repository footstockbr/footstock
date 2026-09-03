// Stub de `server-only` para os testes de integracao.
//
// O pacote real existe so para o bundler do Next barrar import de modulo de
// servidor dentro de bundle de cliente: fora do Next, importa-lo lanca. Os
// testes de integracao rodam em node e importam modulos server-side de
// proposito (services, @/lib/prisma), entao aqui o guard nao tem funcao.
export {}

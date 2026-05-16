export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Tesorería SaaS
        </h1>

        <form className="space-y-4">
          <div>
            <label className="block text-sm mb-1">
              Email
            </label>

            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2"
              placeholder="usuario@empresa.com"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">
              Contraseña
            </label>

            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2"
              placeholder="********"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white rounded-lg py-2"
          >
            Iniciar sesión
          </button>
        </form>
      </div>
    </main>
  );
}

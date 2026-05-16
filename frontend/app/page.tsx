export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Tesorería SaaS ERP
        </h1>

        <p className="text-gray-600 mt-2">
          Enterprise Financial & Operations Platform
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow">
          <h2 className="font-semibold">Ventas</h2>
          <p className="text-2xl mt-2">$0</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow">
          <h2 className="font-semibold">Flujo</h2>
          <p className="text-2xl mt-2">$0</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow">
          <h2 className="font-semibold">Inventario</h2>
          <p className="text-2xl mt-2">0</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow">
          <h2 className="font-semibold">Alertas</h2>
          <p className="text-2xl mt-2">0</p>
        </div>
      </div>
    </main>
  );
}

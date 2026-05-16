export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            Executive Dashboard
          </h1>

          <p className="text-gray-500">
            Financial command center
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-gray-500 text-sm">Liquidez</p>
          <h2 className="text-2xl font-bold mt-2">$0.00</h2>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-gray-500 text-sm">Ventas</p>
          <h2 className="text-2xl font-bold mt-2">$0.00</h2>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-gray-500 text-sm">Conciliación</p>
          <h2 className="text-2xl font-bold mt-2">0 pendientes</h2>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-gray-500 text-sm">Alertas</p>
          <h2 className="text-2xl font-bold mt-2">0 activas</h2>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="text-xl font-semibold mb-4">
          Financial Timeline
        </h3>

        <div className="space-y-3">
          <div className="border rounded-xl p-4">
            No events yet.
          </div>
        </div>
      </div>
    </main>
  );
}

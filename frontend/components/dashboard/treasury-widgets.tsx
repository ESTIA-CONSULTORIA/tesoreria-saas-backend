export function TreasuryWidgets() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="text-lg font-semibold mb-4">
          Flujo Efectivo
        </h3>

        <p className="text-3xl font-bold">
          $285,000
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="text-lg font-semibold mb-4">
          Entradas
        </h3>

        <p className="text-3xl font-bold text-green-600">
          +$74,000
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="text-lg font-semibold mb-4">
          Salidas
        </h3>

        <p className="text-3xl font-bold text-red-600">
          -$38,000
        </p>
      </div>
    </div>
  );
}

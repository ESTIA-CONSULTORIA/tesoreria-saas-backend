export function ActivityFeed() {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-xl font-semibold mb-4">
        Activity Feed
      </h3>

      <div className="space-y-3">
        <div className="border rounded-xl p-4">
          Venta creada correctamente.
        </div>

        <div className="border rounded-xl p-4">
          Conciliación pendiente generada.
        </div>

        <div className="border rounded-xl p-4">
          Dashboard actualizado en tiempo real.
        </div>
      </div>
    </div>
  );
}

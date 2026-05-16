export default function SalesPage() {
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Ventas</h1>
          <p className="text-gray-500">Operational sales flow</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Cliente"
          />

          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Moneda"
            defaultValue="MXN"
          />
        </div>

        <div className="border rounded-xl p-4 mb-4">
          <p className="font-semibold mb-2">Productos</p>

          <div className="grid grid-cols-3 gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Producto" />
            <input className="border rounded-lg px-3 py-2" placeholder="Cantidad" />
            <input className="border rounded-lg px-3 py-2" placeholder="Precio" />
          </div>
        </div>

        <div className="flex justify-end">
          <button className="bg-black text-white px-5 py-2 rounded-xl">
            Crear venta
          </button>
        </div>
      </div>
    </main>
  );
}

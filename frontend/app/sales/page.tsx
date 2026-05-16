'use client';

import { useState } from 'react';

export default function SalesPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function createSale() {
    try {
      setLoading(true);
      setMessage('');

      const response = await fetch('http://localhost:3000/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'tenant-id': 'demo-tenant',
          Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`,
        },
        body: JSON.stringify({
          total: 1500,
          currency: 'MXN',
          items: [
            {
              productId: 'demo-product',
              quantity: 1,
              unitPrice: 1500,
            },
          ],
        }),
      });

      const data = await response.json();

      setMessage(`Venta creada: ${data.saleId}`);
    } catch {
      setMessage('Error creando venta');
    } finally {
      setLoading(false);
    }
  }

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

        <div className="flex justify-end gap-3 items-center">
          {message && <p className="text-sm text-gray-600">{message}</p>}

          <button
            onClick={createSale}
            disabled={loading}
            className="bg-black text-white px-5 py-2 rounded-xl"
          >
            {loading ? 'Procesando...' : 'Crear venta'}
          </button>
        </div>
      </div>
    </main>
  );
}

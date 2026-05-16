'use client';

import { useState } from 'react';

export default function PurchasesPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function createPurchase() {
    try {
      setLoading(true);
      setMessage('');

      const response = await fetch('http://localhost:3000/purchases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'tenant-id': 'demo-tenant',
          Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`,
        },
        body: JSON.stringify({
          supplierId: 'demo-supplier',
          total: 3200,
          currency: 'MXN',
          items: [
            {
              productId: 'demo-product',
              quantity: 10,
              unitCost: 320,
            },
          ],
        }),
      });

      const data = await response.json();

      setMessage(`Compra creada: ${data.purchaseId}`);
    } catch {
      setMessage('Error creando compra');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Compras</h1>
        <p className="text-gray-500">Purchase operational flow</p>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input className="border rounded-lg px-3 py-2" placeholder="Proveedor" />
          <input className="border rounded-lg px-3 py-2" placeholder="Moneda" defaultValue="MXN" />
        </div>

        <div className="border rounded-xl p-4 mb-4">
          <p className="font-semibold mb-2">Productos</p>
          <div className="grid grid-cols-3 gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Producto" />
            <input className="border rounded-lg px-3 py-2" placeholder="Cantidad" />
            <input className="border rounded-lg px-3 py-2" placeholder="Costo" />
          </div>
        </div>

        <div className="flex justify-end gap-3 items-center">
          {message && <p className="text-sm text-gray-600">{message}</p>}

          <button
            onClick={createPurchase}
            disabled={loading}
            className="bg-black text-white px-5 py-2 rounded-xl"
          >
            {loading ? 'Procesando...' : 'Crear compra'}
          </button>
        </div>
      </div>
    </main>
  );
}

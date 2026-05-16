export function ReconciliationStatus() {
  const items = [
    {
      label: 'Conciliadas',
      value: 128,
    },
    {
      label: 'Pendientes',
      value: 12,
    },
    {
      label: 'Anomalías',
      value: 3,
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-xl font-semibold mb-4">
        Reconciliación
      </h3>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between border rounded-xl p-4"
          >
            <span>{item.label}</span>

            <span className="font-bold">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnomalyCenter() {
  const anomalies = [
    {
      severity: 'HIGH',
      message: 'Variación inusual de inventario detectada.',
    },
    {
      severity: 'MEDIUM',
      message: 'Depósito pendiente de conciliación.',
    },
    {
      severity: 'LOW',
      message: 'Incremento atípico de compras.',
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-xl font-semibold mb-4">
        Operational Anomalies
      </h3>

      <div className="space-y-3">
        {anomalies.map((anomaly, index) => (
          <div
            key={index}
            className="border rounded-xl p-4"
          >
            <div className="flex justify-between items-center">
              <span>{anomaly.message}</span>

              <span className="font-bold">
                {anomaly.severity}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

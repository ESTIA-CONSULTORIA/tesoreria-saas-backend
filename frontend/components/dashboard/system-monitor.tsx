export function SystemMonitor() {
  const services = [
    {
      name: 'API',
      status: 'ONLINE',
    },
    {
      name: 'Database',
      status: 'ONLINE',
    },
    {
      name: 'Redis',
      status: 'ONLINE',
    },
    {
      name: 'Websocket',
      status: 'ONLINE',
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-xl font-semibold mb-4">
        System Monitor
      </h3>

      <div className="space-y-3">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between border rounded-xl p-4"
          >
            <span>{service.name}</span>

            <span className="font-bold text-green-600">
              {service.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

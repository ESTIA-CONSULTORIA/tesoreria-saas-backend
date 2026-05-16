export function LiveNotificationCenter() {
  const notifications = [
    {
      type: 'warning',
      message: 'Conciliación pendiente detectada.',
    },
    {
      type: 'info',
      message: 'Nueva venta registrada correctamente.',
    },
    {
      type: 'error',
      message: 'Sync pendiente con gateway bancario.',
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-xl font-semibold mb-4">
        Notification Center
      </h3>

      <div className="space-y-3">
        {notifications.map((notification, index) => (
          <div
            key={index}
            className="border rounded-xl p-4"
          >
            {notification.message}
          </div>
        ))}
      </div>
    </div>
  );
}

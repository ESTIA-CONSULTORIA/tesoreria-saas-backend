export function KpiCards() {
  const cards = [
    {
      title: 'Liquidez',
      value: '$125,000',
    },
    {
      title: 'Ventas Día',
      value: '$48,500',
    },
    {
      title: 'Conciliaciones',
      value: '12 pendientes',
    },
    {
      title: 'Alertas',
      value: '3 activas',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-white rounded-2xl shadow p-5"
        >
          <p className="text-gray-500 text-sm">{card.title}</p>

          <h2 className="text-2xl font-bold mt-2">
            {card.value}
          </h2>
        </div>
      ))}
    </div>
  );
}

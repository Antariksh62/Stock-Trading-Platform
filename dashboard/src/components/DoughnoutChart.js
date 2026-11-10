import React from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      display: true,
      position: "top",
      labels: {
        boxWidth: 10,
        padding: 5,
        font: {
          size: 10,
        },
      },
    },
    tooltip: {
      enabled: true,
      callbacks: {
        label: (context) => ` ${context.label}: ₹${Number(context.raw || 0).toLocaleString()}`,
      },
    },
  },
};

export function DoughnutChart({ data, options }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "280px",
        height: "260px",
        margin: "0 auto",
      }}
    >
      <Doughnut data={data} options={options || defaultOptions} />
    </div>
  );
}
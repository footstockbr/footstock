import { useState } from "react";
import FootStockRoot from "./FootStock.jsx";
import FootStockAdmin from "./FootStockAdmin.jsx";

export default function App() {
  const [view, setView] = useState("app"); // "app" | "admin"

  return (
    <div style={{ minHeight: "100vh", background: "#080b12" }}>
      {/* Toggle bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          padding: "10px 0",
          background: "#0e1219",
          borderBottom: "1px solid #1e2636",
          position: "sticky",
          top: 0,
          zIndex: 9999,
        }}
      >
        <button
          onClick={() => setView("app")}
          style={{
            padding: "8px 24px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            fontFamily: "'Inter', sans-serif",
            background: view === "app" ? "#6c63ff" : "#121820",
            color: view === "app" ? "#fff" : "#7a8ba8",
          }}
        >
          FootStock App
        </button>
        <button
          onClick={() => setView("admin")}
          style={{
            padding: "8px 24px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            fontFamily: "'Inter', sans-serif",
            background: view === "admin" ? "#6c63ff" : "#121820",
            color: view === "admin" ? "#fff" : "#7a8ba8",
          }}
        >
          Admin Panel
        </button>
      </div>

      {/* Content */}
      {view === "app" ? <FootStockRoot /> : <FootStockAdmin />}
    </div>
  );
}

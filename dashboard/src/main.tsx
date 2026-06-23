import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import SignIn from "@/routes/SignIn";
import MagicLogin from "@/routes/MagicLogin";
import ForgotPassword from "@/routes/ForgotPassword";
import Overview from "@/routes/Overview";
import Collections from "@/routes/Collections";
import NewCollection from "@/routes/NewCollection";
import ApiPreview from "@/routes/ApiPreview";
import Logs from "@/routes/Logs";
import SqlConsole from "@/routes/SqlConsole";
import Settings from "@/routes/Settings";
import ProtectedRoute from "@/components/ProtectedRoute";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<SignIn />} />
        <Route path="/magic-login" element={<MagicLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Routes>
                <Route path="/" element={<Overview />} />
                {/* New-collection flow stays on its own path. */}
                <Route path="/collections/new" element={<NewCollection />} />
                {/*
                  All other collection URLs use query params, e.g.
                  /collections?collections=coupons&action=settings
                */}
                <Route path="/collections" element={<Collections />} />
                <Route path="/api-preview" element={<ApiPreview />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/sql" element={<SqlConsole />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

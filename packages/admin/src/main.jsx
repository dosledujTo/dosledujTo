import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "admin-lte/dist/css/adminlte.min.css";
import "./styles.css";

import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { ThemeProvider } from "./theme.jsx";
import { ApiError } from "./api/client.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 401 a 403 sa neopakujú — nie sú to výpadky, ale odpovede.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && [401, 403, 404, 422].includes(error.status)) && failureCount < 2,
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import App from './App';
import DashboardPage from './pages/DashboardPage';
import EditorPage from './pages/EditorPage';
import JobSheetPage from './pages/JobSheetPage';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'new', element: <EditorPage /> },
      { path: 'wo/:id/edit', element: <EditorPage /> },
      { path: 'wo/:id', element: <JobSheetPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

// Register the service worker so the app is installable as a phone app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline install is a progressive enhancement; ignore failures */
    });
  });
}

import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * HTML raíz para el renderizado estático en web (PWA).
 * Enlaza el manifest y registra el service worker que da soporte offline.
 * Solo se ejecuta en Node.js durante el export estático; no corre en native.
 */

const SW_REGISTRATION = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('Service Worker registrado, scope:', registration.scope);
      },
      (error) => {
        console.error('Falló el registro del Service Worker:', error);
      },
    );
  });
}
`;

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="es" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F5F7F8" />
        <meta
          name="description"
          content="Seguimiento personal de salud: registros, análisis y herramientas experimentales, con enfoque privado y offline."
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="firstOption" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon-192.png" />

        <script dangerouslySetInnerHTML={{ __html: SW_REGISTRATION }} />

        {/*
          Desactiva el scroll del body en web para que los ScrollView se
          comporten como en native.
        */}
        <ScrollViewStyleReset />

        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
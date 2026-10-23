"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "BOT" | "HUMANO";

type Conversation = {
  row_number?: number;
  FechaHora?: string;
  Telefono?: string | number;
  Nombre?: string;
  Direccion?: string;
  Origen?: string;
  TipoMensaje?: string;
  Mensaje?: string;
  Estado?: string;
  Anomalia?: string;
  MediaFileId?: string;
  MediaMimeType?: string;
  MediaCaption?: string;
  DriveFileId?: string;
  SessionId?: string;
  MensajeID?: string;
};

type ApiResponse = {
  ok?: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

type CustomerThread = {
  key: string;
  telefono: string;
  nombre: string;
  mensajes: Conversation[];
  ultimo: Conversation;
};

function dateValue(value?: string): number {
  if (!value) return 0;

  const timestamp = Date.parse(value.trim().replace(" ", "T"));

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value?: string): string {
  if (!value) return "Fecha no disponible";

  const timestamp = dateValue(value);
  if (!timestamp) return value;

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatShortTime(value?: string): string {
  if (!value) return "";

  const timestamp = dateValue(value);
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isIncoming(item: Conversation): boolean {
  return String(item.Direccion ?? "").trim().toUpperCase() === "ENTRANTE";
}

function getMessage(item: Conversation): string {
  const message = String(item.Mensaje ?? "").trim();

  if (message) return message;

  if (item.TipoMensaje?.toLowerCase() === "image") {
    return "El cliente envió una imagen.";
  }

  return "(Mensaje sin texto)";
}

export default function ConversationsInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Solo una conversación estará desplegada a la vez.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // De inicio mostramos solo los mensajes recientes; el historial anterior se despliega a petición.
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({});
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const [modeByPhone, setModeByPhone] = useState<Record<string, Mode>>({});
  const [modeMessage, setModeMessage] = useState<Record<string, string>>({});
  const [modeLoading, setModeLoading] = useState<string | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyMessages, setReplyMessages] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/conversations", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error || "No fue posible cargar las conversaciones."
        );
      }

      if (!Array.isArray(result.data)) {
        throw new Error("La respuesta de n8n no tiene el formato esperado.");
      }

      setConversations(result.data as Conversation[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cargar la bandeja."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Al abrir una conversación o actualizar mensajes, mostrar primero los mensajes más recientes.
  useEffect(() => {
    const contenedor = messagesContainerRef.current;
    if (expandedKey && contenedor) {
      contenedor.scrollTop = contenedor.scrollHeight;
    }
  }, [expandedKey, conversations]);

  const threads = useMemo(() => {
    const groups = new Map<string, Conversation[]>();

    for (const item of conversations) {
      const phone = String(item.Telefono ?? "").trim();
      const name = String(item.Nombre ?? "").trim();

      const key = phone
        ? phone.replace(/\D/g, "")
        : `sin-telefono:${name || "desconocido"}`;

      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }

    const term = search.trim().toLocaleLowerCase();
    const result: CustomerThread[] = [];

    for (const [key, messages] of groups.entries()) {
      const sortedMessages = [...messages].sort(
        (a, b) => dateValue(b.FechaHora) - dateValue(a.FechaHora)
      );

      const latest = sortedMessages[0];
      if (!latest) continue;

      const telefono = String(latest.Telefono ?? "").trim();

      const nombreItem = sortedMessages.find(
        (item) => String(item.Nombre ?? "").trim()
      );

      const nombre =
        String(nombreItem?.Nombre ?? "").trim() || "Cliente sin nombre";

      const searchable = [
        nombre,
        telefono,
        ...sortedMessages.map(getMessage),
      ]
        .join(" ")
        .toLocaleLowerCase();

      if (term && !searchable.includes(term)) continue;

      result.push({
        key,
        telefono,
        nombre,
        mensajes: sortedMessages,
        ultimo: latest,
      });
    }

    return result.sort(
      (a, b) => dateValue(a.ultimo.FechaHora) - dateValue(b.ultimo.FechaHora)
    );
  }, [conversations, search]);

  const incomingCount = conversations.filter(isIncoming).length;

  const outgoingCount = conversations.filter(
    (item) => !isIncoming(item)
  ).length;

  const anomalyCount = conversations.filter(
    (item) => Boolean(item.Anomalia?.trim())
  ).length;

  async function changeMode(thread: CustomerThread, mode: Mode) {
    const phone = thread.telefono;

    if (!phone) {
      setModeMessage((previous) => ({
        ...previous,
        [thread.key]: "Este cliente no tiene un teléfono registrado.",
      }));
      return;
    }

    const description =
      mode === "HUMANO"
        ? "El bot dejará de responder automáticamente a este teléfono."
        : "El bot volverá a responder automáticamente a este teléfono.";

    if (
      !window.confirm(
        `¿Cambiar la atención de ${thread.nombre} (${phone}) a ${mode}?\n\n${description}`
      )
    ) {
      return;
    }

    setModeLoading(thread.key);
    setModeMessage((previous) => ({ ...previous, [thread.key]: "" }));

    try {
      const response = await fetch("/api/conversations/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono: phone, modo: mode }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || result.ok !== true) {
        throw new Error(
          result.message || result.error || "No fue posible cambiar el modo."
        );
      }

      setModeByPhone((previous) => ({ ...previous, [phone]: mode }));

      setModeMessage((previous) => ({
        ...previous,
        [thread.key]: result.message || `Modo actualizado a ${mode}.`,
      }));
    } catch (err) {
      setModeMessage((previous) => ({
        ...previous,
        [thread.key]:
          err instanceof Error ? err.message : "Error al cambiar el modo.",
      }));
    } finally {
      setModeLoading(null);
    }
  }

  async function sendManualReply(thread: CustomerThread) {
    const message = String(replyDrafts[thread.key] ?? "").trim();

    if (!thread.telefono) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]: "Este cliente no tiene un teléfono registrado.",
      }));
      return;
    }

    if (!message) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]: "Escribe el mensaje antes de enviarlo.",
      }));
      return;
    }

    if (message.length > 4000) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]: "El mensaje no puede superar 4000 caracteres.",
      }));
      return;
    }

    if (
      !window.confirm(
        `¿Enviar esta respuesta a ${thread.nombre} (${thread.telefono}) por WhatsApp?`
      )
    ) {
      return;
    }

    setReplyLoading(thread.key);
    setReplyMessages((previous) => ({ ...previous, [thread.key]: "" }));

    try {
      const response = await fetch("/api/conversations/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefono: thread.telefono,
          nombre: thread.nombre,
          mensaje: message,
        }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || result.ok !== true) {
        throw new Error(
          result.message ||
            result.error ||
            "No fue posible preparar la respuesta."
        );
      }

      setReplyDrafts((previous) => ({
        ...previous,
        [thread.key]: "",
      }));

      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]:
          result.message ||
          "La respuesta fue aceptada para procesarse mediante n8n.",
      }));

      setModeByPhone((previous) => ({
        ...previous,
        [thread.telefono]: "HUMANO",
      }));

      // Volver a consultar para mostrar el mensaje cuando esté registrado.
      await loadConversations();
    } catch (err) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]:
          err instanceof Error
            ? err.message
            : "Ocurrió un error al preparar la respuesta.",
      }));
    } finally {
      setReplyLoading(null);
    }
  }

  return (
    <main className="neo-app neo-conversations min-h-screen bg-slate-100 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 px-5 py-5 text-white sm:px-8">
        <div>
          <p className="text-xl font-bold">NEO</p>
          <p className="text-xs tracking-wider text-slate-300">
            TRANSPORTACIONES
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void loadConversations()}
            disabled={loading}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          <a
            href="/"
            className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-200"
          >
            Volver al panel
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5 sm:p-8">
        <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-800 p-7 text-white sm:p-9">
          <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">
            ATENCIÓN AL CLIENTE
          </p>

          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            Bandeja de conversaciones
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
            Selecciona un cliente para consultar el historial y responder
            por WhatsApp.
          </p>
        </section>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { titulo: "Mensajes registrados", valor: conversations.length },
            { titulo: "Mensajes entrantes", valor: incomingCount },
            { titulo: "Mensajes salientes", valor: outgoingCount },
            { titulo: "Alertas registradas", valor: anomalyCount },
          ].map((stat) => (
            <article
              key={stat.titulo}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{stat.titulo}</p>
              <p className="mt-3 text-3xl font-bold">{stat.valor}</p>
              <p className="mt-2 text-xs text-slate-400">
                Datos recuperados de la bandeja
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8">
          <label
            htmlFor="conversationSearch"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Buscar clientes y mensajes
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="conversationSearch"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, teléfono o mensaje..."
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            />

            <button
              onClick={() => setSearch("")}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium hover:bg-slate-50"
            >
              Limpiar búsqueda
            </button>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Conversaciones</h2>
            <span className="text-sm text-slate-500">
              {threads.length} clientes
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
            >
              <p className="font-semibold">No pudimos cargar la bandeja.</p>
              <p className="mt-2">{error}</p>
              <button
                onClick={() => void loadConversations()}
                className="mt-4 rounded-lg bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-700"
              >
                Intentar nuevamente
              </button>
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Cargando conversaciones...
            </div>
          )}

          {!loading && !error && threads.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="font-semibold">No encontramos clientes.</p>
              <p className="mt-2 text-sm text-slate-500">
                Prueba otra búsqueda o actualiza la bandeja.
              </p>
            </div>
          )}

          {!loading && !error && threads.length > 0 && (
            <div className="space-y-2">
              {threads.map((thread) => {
                const isExpanded = expandedKey === thread.key;
                const currentMode = modeByPhone[thread.telefono];
                const modeBusy = modeLoading === thread.key;
                const replyBusy = replyLoading === thread.key;

                const chronologicalMessages = [...thread.mensajes].sort(
                  (a, b) => dateValue(a.FechaHora) - dateValue(b.FechaHora)
                );
                const recentLimit = 10;
                const olderCount = Math.max(0, chronologicalMessages.length - recentLimit);
                const historyIsVisible = showHistory[thread.key] === true;
                const visibleMessages = historyIsVisible
                  ? chronologicalMessages
                  : chronologicalMessages.slice(-recentLimit);

                return (
                  <article
                    key={thread.key}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    {/* Fila compacta: nombre y una sola línea del mensaje */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedKey(isExpanded ? null : thread.key)
                      }
                      aria-expanded={isExpanded}
                      className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-slate-50 sm:px-5"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-100 font-bold text-cyan-900">
                        {thread.nombre.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                            {thread.nombre}
                          </h3>

                          <span className="shrink-0 text-xs text-slate-400">
                            {formatShortTime(thread.ultimo.FechaHora)}
                          </span>
                        </div>

                        <p className="mt-1 truncate text-sm text-slate-500">
                          {getMessage(thread.ultimo)}
                        </p>
                      </div>

                      <span
                        aria-hidden="true"
                        className="shrink-0 text-lg text-slate-400"
                      >
                        {isExpanded ? "⌃" : "⌄"}
                      </span>
                    </button>

                    {/* Contenido desplegado al seleccionar al cliente */}
                    {isExpanded && (
                      <div className="border-t border-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 sm:px-5">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {thread.nombre}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {thread.telefono || "Teléfono no registrado"}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                currentMode === "HUMANO"
                                  ? "bg-amber-100 text-amber-900"
                                  : currentMode === "BOT"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {currentMode
                                ? `Modo cambiado aquí: ${currentMode}`
                                : "Modo actual no consultado"}
                            </span>

                            <span className="text-xs text-slate-400">
                              {thread.mensajes.length} mensajes
                            </span>
                          </div>
                        </div>

                        {/* El historial anterior permanece plegado hasta que el usuario lo solicite. */}
                        {olderCount > 0 && (
                          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                            <button
                              type="button"
                              onClick={() => setShowHistory((previous) => ({ ...previous, [thread.key]: !historyIsVisible }))}
                              aria-expanded={historyIsVisible}
                              className="rounded-lg border border-cyan-200 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
                            >
                              {historyIsVisible
                                ? "Ocultar historial anterior"
                                : `Ver historial anterior (${olderCount} mensajes)`}
                            </button>
                          </div>
                        )}

                        {/* Mensajes recientes: los más nuevos quedan abajo y se muestran al abrir. */}
                        <div ref={messagesContainerRef} className="max-h-[520px] space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5">
                          {visibleMessages.map((message, index) => {
                            const incoming = isIncoming(message);

                            return (
                              <div
                                key={
                                  message.MensajeID ||
                                  `${message.FechaHora}-${message.row_number ?? index}`
                                }
                                className={`flex ${
                                  incoming ? "justify-start" : "justify-end"
                                }`}
                              >
                                <div
                                  className={`w-full max-w-2xl rounded-2xl border p-3 sm:p-4 ${
                                    incoming
                                      ? "border-slate-200 bg-white"
                                      : "border-violet-100 bg-violet-50"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-slate-600">
                                      {incoming ? thread.nombre : "Neo"}
                                    </span>

                                    <span className="text-xs text-slate-400">
                                      {formatDate(message.FechaHora)}
                                    </span>
                                  </div>

                                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                                    {getMessage(message)}
                                  </p>

                                  {message.MediaCaption && (
                                    <p className="mt-2 text-xs text-slate-500">
                                      {message.MediaCaption}
                                    </p>
                                  )}

                                  {message.MediaFileId && (
                                    <p className="mt-2 text-xs text-cyan-800">
                                      Adjunto de WhatsApp registrado
                                    </p>
                                  )}

                                  {message.DriveFileId && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      Archivo registrado en Google Drive
                                    </p>
                                  )}

                                  {message.Anomalia?.trim() && (
                                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                      <p className="font-semibold">Alerta</p>
                                      <p className="mt-1 whitespace-pre-wrap break-words">
                                        {message.Anomalia}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Controles de atención y respuesta */}
                        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
                          <section>
                            <h4 className="mb-3 text-sm font-semibold text-slate-800">
                              Control de atención
                            </h4>

                            <button
                              onClick={() => void changeMode(thread, "HUMANO")}
                              disabled={
                                modeBusy ||
                                !thread.telefono ||
                                currentMode === "HUMANO"
                              }
                              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {modeBusy ? "Guardando..." : "Tomar control"}
                            </button>

                            <button
                              onClick={() => void changeMode(thread, "BOT")}
                              disabled={
                                modeBusy ||
                                !thread.telefono ||
                                currentMode === "BOT"
                              }
                              className="mt-2 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {modeBusy ? "Guardando..." : "Reactivar BOT"}
                            </button>

                            {modeMessage[thread.key] && (
                              <div
                                role="status"
                                className="mt-3 break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"
                              >
                                {modeMessage[thread.key]}
                              </div>
                            )}
                          </section>

                          <section>
                            <h4 className="mb-3 text-sm font-semibold text-slate-800">
                              Responder por WhatsApp
                            </h4>

                            <textarea
                              value={replyDrafts[thread.key] || ""}
                              onChange={(event) =>
                                setReplyDrafts((previous) => ({
                                  ...previous,
                                  [thread.key]: event.target.value,
                                }))
                              }
                              maxLength={4000}
                              rows={4}
                              disabled={!thread.telefono || replyBusy}
                              placeholder="Escribe tu respuesta al cliente..."
                              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                            />

                            <div className="mt-2 flex items-center justify-between gap-3">
                              <span className="text-xs text-slate-400">
                                {(replyDrafts[thread.key] || "").length}/4000
                              </span>

                              <button
                                onClick={() => void sendManualReply(thread)}
                                disabled={
                                  replyBusy ||
                                  !thread.telefono ||
                                  !(replyDrafts[thread.key] || "").trim()
                                }
                                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {replyBusy ? "Procesando..." : "Enviar respuesta"}
                              </button>
                            </div>

                            {replyMessages[thread.key] && (
                              <div
                                role="status"
                                className="mt-3 break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"
                              >
                                {replyMessages[thread.key]}
                              </div>
                            )}

                            <p className="mt-3 text-xs leading-5 text-slate-500">
                              La respuesta se procesa mediante el workflow
                              existente de respuestas humanas.
                            </p>
                          </section>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-xs text-slate-400">
          Neo Transportaciones · Bandeja de conversaciones
        </footer>
      </div>
    </main>
  );
}
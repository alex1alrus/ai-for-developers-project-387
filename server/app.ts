import Fastify, { type FastifyError, type FastifyReply } from 'fastify'
import glue from 'fastify-openapi-glue'
import fastifyStatic from '@fastify/static'
import { join } from 'node:path'
import type { RouteHandlers } from './api/fastify.gen.ts'
import type { ApiError, Booking, EventType } from './api/types.gen.ts'
import { freeSlots } from './slots.ts'
import { randomUUID } from 'node:crypto'

const specification = join(import.meta.dirname, '../spec/generated/openapi.yaml')

// `webRoot`: the built frontend (`npm run build`), served with SPA fallback (ADR-0001).
export function buildApp({ webRoot = join(import.meta.dirname, '../dist') } = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  const eventTypes: EventType[] = []
  const bookings: Booking[] = []

  /** The event type with `id`, or `undefined` after answering 404 EVENT_TYPE_NOT_FOUND. */
  function findEventType(id: string, reply: FastifyReply) {
    const eventType = eventTypes.find((eventType) => eventType.id === id)
    if (!eventType) reply.code(404).send({ code: 'EVENT_TYPE_NOT_FOUND', message: `Event type "${id}" not found` })
    return eventType
  }

  const serviceHandlers: RouteHandlers = {
    listEventTypes(_req, reply) {
      reply.code(200).send(eventTypes.toSorted((a, b) => a.title.localeCompare(b.title)))
    },
    // Synchronous: no await between the id check and the push, so concurrent requests cannot both pass.
    createEventType(req, reply) {
      if (eventTypes.some((eventType) => eventType.id === req.body.id)) {
        reply.code(409).send({ code: 'EVENT_TYPE_EXISTS', message: `Event type "${req.body.id}" already exists` })
        return
      }
      eventTypes.push(req.body)
      reply.code(201).send(req.body)
    },
    listSlots(req, reply) {
      const eventType = findEventType(req.params.id, reply)
      if (!eventType) return
      reply.code(200).send(freeSlots(eventType.durationMinutes, bookings, new Date()))
    },
    listBookings(_req, reply) {
      const now = Date.now()
      reply.code(200).send(bookings.filter((b) => Date.parse(b.end) > now).toSorted((a, b) => a.start.localeCompare(b.start)))
    },
    // Synchronous: no await between the conflict check and the push, so concurrent requests cannot both pass.
    createBooking(req, reply) {
      const { eventTypeId, start } = req.body
      const eventType = findEventType(eventTypeId, reply)
      if (!eventType) return
      const now = new Date()
      const startIso = new Date(start).toISOString()
      const slot = freeSlots(eventType.durationMinutes, [], now).find((slot) => slot.start === startIso)
      if (!slot) {
        reply.code(400).send({ code: 'INVALID_START', message: `${start} is not a slot start of "${eventTypeId}"` })
        return
      }
      // The overlap rule itself lives in `freeSlots`: a slot that overlaps any booking is not free.
      if (!freeSlots(eventType.durationMinutes, bookings, now).some((free) => free.start === slot.start)) {
        reply.code(409).send({ code: 'BOOKING_CONFLICT', message: `${start} overlaps an existing booking` })
        return
      }
      const booking: Booking = { ...req.body, id: randomUUID(), start: slot.start, end: slot.end }
      bookings.push(booking)
      reply.code(201).send(booking)
    },
  }

  // Fastify validates a body only for the content types its schema lists, so anything else must be refused here.
  app.addHook('onRequest', async (req, reply) => {
    const content = (req.routeOptions.schema?.body as { content?: object } | undefined)?.content
    const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase() ?? ''
    if (content && !Object.hasOwn(content, type)) {
      const error: ApiError = { code: 'VALIDATION_ERROR', message: `Unsupported content type "${type}"` }
      return reply.code(400).send(error)
    }
  })

  // Client errors (schema, malformed JSON, empty body, ...) all become VALIDATION_ERROR; 5xx stay as they are.
  app.setErrorHandler<FastifyError>((error, _req, reply) => {
    if (!error.validation && !(error.statusCode && error.statusCode >= 400 && error.statusCode < 500)) throw error
    const body: ApiError = { code: 'VALIDATION_ERROR', message: error.message }
    reply.code(400).send(body)
  })

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.register(glue, { specification, serviceHandlers })
  app.register(fastifyStatic, { root: webRoot })
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !/^\/api(\/|\?|$)/.test(req.url)) return reply.sendFile('index.html')
    const error: ApiError = { code: 'NOT_FOUND', message: `${req.method} ${req.url} not found` }
    return reply.code(404).send(error)
  })

  return app
}

import "@typespec/http";
import "@typespec/openapi";

using Http;

@service(#{ title: "Call booking API" })
namespace CallBooking;

/** A call format the owner offers. */
model EventType {
  /** Short identifier set by the owner, used in URLs. */
  @pattern("^[a-z0-9]+(-[a-z0-9]+)*$")
  @maxLength(64)
  id: string;

  /** No surrounding whitespace, no line breaks. */
  @pattern("^\\S(.*\\S)?$")
  @minLength(1)
  @maxLength(100)
  title: string;

  @maxLength(500)
  description: string;

  /** Multiple of 15, from 15 to 540. */
  @minValue(15)
  @maxValue(540)
  @OpenAPI.extension("multipleOf", 15)
  durationMinutes: int32;
}

/** A free interval `[start, end)` of an event type's duration; computed, not stored. */
model Slot {
  start: utcDateTime;
  end: utcDateTime;
}

/** What a guest sends to book a slot. */
model BookingRequest {
  eventTypeId: string;

  /** Must be a start of a slot of the event type. */
  start: utcDateTime;

  /** No surrounding whitespace, no line breaks. */
  @pattern("^\\S(.*\\S)?$")
  @minLength(1)
  @maxLength(100)
  guestName: string;

  @pattern("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
  @maxLength(254)
  guestEmail: string;
}

/** An interval `[start, end)` a guest took for an event type. */
model Booking {
  @format("uuid") id: string;
  ...BookingRequest;

  /** `start` plus the event type's duration. */
  end: utcDateTime;
}

union ApiErrorCode {
  "VALIDATION_ERROR",
  "INVALID_START",
  "EVENT_TYPE_NOT_FOUND",
  "EVENT_TYPE_EXISTS",
  "BOOKING_CONFLICT",

  // Unknown path under `/api`, or a non-GET request outside it.
  "NOT_FOUND",
}

@error
model ApiError {
  code: ApiErrorCode;

  /** English text for developers; the UI builds user text from `code`. */
  message: string;
}

@route("/api/event-types")
@tag("EventTypes")
interface EventTypes {
  /** All event types sorted by title. */
  @get @OpenAPI.operationId("listEventTypes") list(): EventType[];

  /** Creates an event type; `id` must be unused. */
  @post
  @OpenAPI.operationId("createEventType")
  create(@body eventType: EventType):
    | {
        @statusCode statusCode: 201;
        @body body: EventType;
      }
    | {
        @statusCode statusCode: 400;
        @body body: ApiError;
      }
    | {
        @statusCode statusCode: 409;
        @body body: ApiError;
      };

  /**
   * Free slots of the booking window sorted by start.
   * The service time zone is UTC. The booking window is 14 UTC dates: today (UTC) and the next 13 days.
   * Working hours are 09:00–18:00 UTC every day. Slot starts follow a 30-minute grid from 09:00,
   * a slot lasts the event type's duration and ends no later than 18:00. Past slots are not listed.
   */
  @get
  @route("{id}/slots")
  @OpenAPI.operationId("listSlots")
  listSlots(@path id: string):
    | Slot[]
    | {
        @statusCode statusCode: 404;
        @body body: ApiError;
      };
}

@route("/api/bookings")
@tag("Bookings")
interface Bookings {
  /** Upcoming bookings (`end > now`, ongoing included) of all event types sorted by start. */
  @get @OpenAPI.operationId("listBookings") list(): Booking[];

  /** Books a free slot; no overlap with any booking of any event type. */
  @post
  @OpenAPI.operationId("createBooking")
  create(@body booking: BookingRequest):
    | {
        @statusCode statusCode: 201;
        @body body: Booking;
      }
    | {
        @statusCode statusCode: 400;
        @body body: ApiError;
      }
    | {
        @statusCode statusCode: 404;
        @body body: ApiError;
      }
    | {
        @statusCode statusCode: 409;
        @body body: ApiError;
      };
}

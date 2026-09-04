CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."date_range_type" AS ENUM('rolling', 'fixed', 'indefinite');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('google_meet', 'phone', 'in_person', 'custom');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('text', 'textarea', 'select', 'multiselect', 'phone', 'checkbox');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by" AS ENUM('host', 'invitee', 'system');--> statement-breakpoint
CREATE TYPE "public"."calendar_connection_status" AS ENUM('active', 'needs_reauth');--> statement-breakpoint
CREATE TYPE "public"."calendar_provider" AS ENUM('google');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"welcome_text" text,
	"week_start" integer DEFAULT 0 NOT NULL,
	"default_schedule_id" uuid,
	"onboarding_completed_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	CONSTRAINT "availability_rules_weekday_check" CHECK ("availability_rules"."weekday" between 0 and 6),
	CONSTRAINT "availability_rules_minutes_check" CHECK ("availability_rules"."start_minute" >= 0 and "availability_rules"."start_minute" < "availability_rules"."end_minute" and "availability_rules"."end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "availability_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_override_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_override_id" uuid NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	CONSTRAINT "date_override_intervals_minutes_check" CHECK ("date_override_intervals"."start_minute" >= 0 and "date_override_intervals"."start_minute" < "date_override_intervals"."end_minute" and "date_override_intervals"."end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "date_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_unavailable" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_type_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"color" text DEFAULT '#0069ff' NOT NULL,
	"location_type" "location_type" DEFAULT 'custom' NOT NULL,
	"location_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule_id" uuid,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_minutes" integer DEFAULT 120 NOT NULL,
	"slot_interval_minutes" integer,
	"max_bookings_per_day" integer,
	"date_range_type" date_range_type DEFAULT 'rolling' NOT NULL,
	"date_range_days" integer DEFAULT 60 NOT NULL,
	"date_range_from" date,
	"date_range_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"reminder_offsets_minutes" integer[] DEFAULT '{1440,60}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uid" text NOT NULL,
	"event_type_id" uuid NOT NULL,
	"host_user_id" text NOT NULL,
	"start_utc" timestamp with time zone NOT NULL,
	"end_utc" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"invitee_name" text NOT NULL,
	"invitee_email" text NOT NULL,
	"invitee_timezone" text NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location_type" "location_type" NOT NULL,
	"location_value" text,
	"meeting_url" text,
	"cancel_reason" text,
	"cancelled_by" "cancelled_by",
	"cancelled_at" timestamp with time zone,
	"rescheduled_from_id" uuid,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"external_calendar_event_id" text,
	"external_calendar_id" text,
	"no_show" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"account_id" text NOT NULL,
	"external_email" text NOT NULL,
	"destination_calendar_id" text,
	"status" "calendar_connection_status" DEFAULT 'active' NOT NULL,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selected_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"is_checked_for_conflicts" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_default_schedule_id_availability_schedules_id_fk" FOREIGN KEY ("default_schedule_id") REFERENCES "public"."availability_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_schedule_id_availability_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."availability_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_schedules" ADD CONSTRAINT "availability_schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_override_intervals" ADD CONSTRAINT "date_override_intervals_date_override_id_date_overrides_id_fk" FOREIGN KEY ("date_override_id") REFERENCES "public"."date_overrides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_overrides" ADD CONSTRAINT "date_overrides_schedule_id_availability_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."availability_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type_questions" ADD CONSTRAINT "event_type_questions_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_schedule_id_availability_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."availability_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_user_id_user_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rescheduled_from_id_bookings_id_fk" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selected_calendars" ADD CONSTRAINT "selected_calendars_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_unique" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "availability_rules_schedule_weekday_idx" ON "availability_rules" USING btree ("schedule_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_schedules_user_default_unique" ON "availability_schedules" USING btree ("user_id") WHERE "availability_schedules"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "date_overrides_schedule_date_unique" ON "date_overrides" USING btree ("schedule_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "event_types_owner_slug_unique" ON "event_types" USING btree ("owner_user_id","slug");--> statement-breakpoint
CREATE INDEX "event_types_owner_idx" ON "event_types" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "bookings_host_start_end_confirmed_idx" ON "bookings" USING btree ("host_user_id","start_utc","end_utc") WHERE "bookings"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "bookings_event_type_start_confirmed_idx" ON "bookings" USING btree ("event_type_id","start_utc") WHERE "bookings"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "bookings_invitee_email_idx" ON "bookings" USING btree ("invitee_email");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_user_provider_email_unique" ON "calendar_connections" USING btree ("user_id","provider","external_email");--> statement-breakpoint
CREATE UNIQUE INDEX "selected_calendars_connection_external_unique" ON "selected_calendars" USING btree ("connection_id","external_calendar_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("host_user_id" WITH =, tstzrange("start_utc", "end_utc", '[)') WITH &&)
  WHERE (status = 'confirmed');

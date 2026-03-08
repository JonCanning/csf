export type Applicant = {
	id: string;
	phone: string;
	name: string;
	email?: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateApplicant = {
	phone: string;
	name: string;
	email?: string;
};

export type UpdateApplicant = {
	phone?: string;
	name?: string;
	email?: string | null;
};

// Commands

import type { Command, Event } from "@event-driven-io/emmett";

export type CreateApplicantCommand = Command<
	"CreateApplicant",
	{
		id: string;
		phone: string;
		name: string;
		email?: string;
		createdAt: string;
	}
>;

export type UpdateApplicantCommand = Command<
	"UpdateApplicant",
	{
		id: string;
		phone?: string;
		name?: string;
		email?: string | null;
		updatedAt: string;
	}
>;

export type DeleteApplicantCommand = Command<
	"DeleteApplicant",
	{
		id: string;
		deletedAt: string;
	}
>;

export type ApplicantCommand =
	| CreateApplicantCommand
	| UpdateApplicantCommand
	| DeleteApplicantCommand;

// Events

export type ApplicantCreated = Event<
	"ApplicantCreated",
	{
		id: string;
		phone: string;
		name: string;
		email?: string;
		createdAt: string;
	}
>;

export type ApplicantUpdated = Event<
	"ApplicantUpdated",
	{
		id: string;
		phone?: string;
		name?: string;
		email?: string | null;
		updatedAt: string;
	}
>;

export type ApplicantDeleted = Event<
	"ApplicantDeleted",
	{
		id: string;
		deletedAt: string;
	}
>;

export type ApplicantEvent =
	| ApplicantCreated
	| ApplicantUpdated
	| ApplicantDeleted;

export type ApplicantEventType = ApplicantEvent["type"];

// State

export type ApplicantState =
	| { status: "initial" }
	| {
			status: "active";
			id: string;
			phone: string;
			name: string;
			email?: string;
			createdAt: string;
			updatedAt: string;
	  }
	| { status: "deleted" };

export type Volunteer = {
	id: string;
	name: string;
	phone?: string;
	email?: string;
	isAdmin: boolean;
	isDisabled: boolean;
	requiresPasswordReset: boolean;
	createdAt: string;
	updatedAt: string;
};

export type CreateVolunteer = {
	name: string;
	phone?: string;
	email?: string;
	password: string;
	isAdmin?: boolean;
};

export type UpdateVolunteer = {
	name: string;
	phone?: string | null;
	email?: string | null;
	password?: string;
	isAdmin?: boolean;
};

// Commands

import type { Command, Event } from "@event-driven-io/emmett";

export type CreateVolunteerCommand = Command<
	"CreateVolunteer",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		isAdmin?: boolean;
		requiresPasswordReset?: boolean;
		createdAt: string;
	}
>;

export type UpdateVolunteerCommand = Command<
	"UpdateVolunteer",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		isAdmin?: boolean;
		updatedAt: string;
	}
>;

export type DisableVolunteerCommand = Command<
	"DisableVolunteer",
	{
		id: string;
		disabledAt: string;
	}
>;

export type EnableVolunteerCommand = Command<
	"EnableVolunteer",
	{
		id: string;
		enabledAt: string;
	}
>;

export type ChangePasswordCommand = Command<
	"ChangePassword",
	{
		id: string;
		changedAt: string;
	}
>;

export type VolunteerCommand =
	| CreateVolunteerCommand
	| UpdateVolunteerCommand
	| DisableVolunteerCommand
	| EnableVolunteerCommand
	| ChangePasswordCommand;

// Events

export type VolunteerCreated = Event<
	"VolunteerCreated",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		isAdmin?: boolean;
		requiresPasswordReset?: boolean;
		createdAt: string;
	}
>;

export type VolunteerUpdated = Event<
	"VolunteerUpdated",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		isAdmin?: boolean;
		updatedAt: string;
	}
>;

export type VolunteerDisabled = Event<
	"VolunteerDisabled",
	{
		id: string;
		disabledAt: string;
	}
>;

export type VolunteerEnabled = Event<
	"VolunteerEnabled",
	{
		id: string;
		enabledAt: string;
	}
>;

export type PasswordChanged = Event<
	"PasswordChanged",
	{
		id: string;
		changedAt: string;
	}
>;

export type VolunteerEvent =
	| VolunteerCreated
	| VolunteerUpdated
	| VolunteerDisabled
	| VolunteerEnabled
	| PasswordChanged;

export type VolunteerEventType = VolunteerEvent["type"];

// State

export type VolunteerState =
	| { status: "initial" }
	| {
			status: "active" | "disabled";
			id: string;
			name: string;
			phone?: string;
			email?: string;
			isAdmin: boolean;
			requiresPasswordReset: boolean;
			createdAt: string;
			updatedAt: string;
	  };

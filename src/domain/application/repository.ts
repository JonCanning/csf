export type ApplicationRow = {
	id: string;
	applicantId: string;
	monthCycle: string;
	status: string;
	rank: number | null;
	paymentPreference: string;
	name: string | null;
	phone: string | null;
	rejectReason: string | null;
	appliedAt: string | null;
	acceptedAt: string | null;
	selectedAt: string | null;
	rejectedAt: string | null;
};

export interface ApplicationRepository {
	getById(id: string): Promise<ApplicationRow | null>;
	listByMonth(monthCycle: string): Promise<ApplicationRow[]>;
	listDistinctMonths(): Promise<string[]>;
}

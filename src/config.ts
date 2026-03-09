let _fundName = "Community Solidarity Fund";

export function setFundName(name: string): void {
	_fundName = name;
}

export function getFundName(): string {
	return _fundName;
}

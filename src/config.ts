let _fundName = "Community Solidarity Fund";

/** @internal - mutating this in tests requires resetting via setFundName() */
export function setFundName(name: string): void {
	_fundName = name;
}

export function resetFundName(): void {
	_fundName = "Community Solidarity Fund";
}

export function getFundName(): string {
	return _fundName;
}

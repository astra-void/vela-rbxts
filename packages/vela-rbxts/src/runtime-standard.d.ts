type LuaTuple<T extends unknown[]> = T & {
	readonly _nominal_LuaTuple: unique symbol;
};

interface IterableFunction<T> extends Iterable<T> {
	(): T;
}

declare function pairs<T>(
	value: Record<string, T>,
): IterableFunction<LuaTuple<[string, T]>>;

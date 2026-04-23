declare function pairs<T>(
	value: Record<string, T>,
): IterableFunction<LuaTuple<[string, T]>>;

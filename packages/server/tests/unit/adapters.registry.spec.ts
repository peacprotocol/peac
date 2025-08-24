import { AdapterRegistry } from '../../src/adapters/registry';

describe('AdapterRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  const createMockAdapter = (name, options = {}) => ({
    name: () => name,
    discoveryFragment: jest.fn(() => options.discoveryFragment || {}),
    initialize: options.initialize || jest.fn(),
    shutdown: options.shutdown || jest.fn(),
    ...options.additionalMethods,
  });

  describe('register', () => {
    it('should register adapter successfully', async () => {
      const mockAdapter = createMockAdapter('test-adapter');

      await registry.register(mockAdapter);

      const retrieved = registry.get('test-adapter');
      expect(retrieved).toBe(mockAdapter);
      expect(mockAdapter.initialize).toHaveBeenCalled();
    });

    it('should throw error for duplicate registration', async () => {
      const mockAdapter = createMockAdapter('duplicate-adapter');

      await registry.register(mockAdapter);

      await expect(registry.register(mockAdapter)).rejects.toThrow(
        'Adapter already registered: duplicate-adapter',
      );
    });

    it('should register adapter without initialize method', async () => {
      const mockAdapter = createMockAdapter('no-init-adapter', {
        initialize: undefined,
      });
      delete mockAdapter.initialize;

      await expect(registry.register(mockAdapter)).resolves.toBeUndefined();
    });

    it('should pass configuration to adapter initialize', async () => {
      process.env.PEAC_ADAPTER_TEST_CONFIG_KEY = 'test-value';
      process.env.PEAC_ADAPTER_TEST_ANOTHER_KEY = 'another-value';

      const mockAdapter = createMockAdapter('test');

      await registry.register(mockAdapter);

      expect(mockAdapter.initialize).toHaveBeenCalledWith({
        config_key: 'test-value',
        another_key: 'another-value',
      });

      delete process.env.PEAC_ADAPTER_TEST_CONFIG_KEY;
      delete process.env.PEAC_ADAPTER_TEST_ANOTHER_KEY;
    });

    it('should handle empty configuration', async () => {
      const mockAdapter = createMockAdapter('empty-config');

      await registry.register(mockAdapter);

      expect(mockAdapter.initialize).toHaveBeenCalledWith({});
    });
  });

  describe('get', () => {
    it('should return registered adapter', async () => {
      const mockAdapter = createMockAdapter('get-test');
      await registry.register(mockAdapter);

      const result = registry.get('get-test');

      expect(result).toBe(mockAdapter);
    });

    it('should return undefined for non-existent adapter', () => {
      const result = registry.get('non-existent');

      expect(result).toBeUndefined();
    });

    it('should return correct adapter for multiple registrations', async () => {
      const adapter1 = createMockAdapter('adapter1');
      const adapter2 = createMockAdapter('adapter2');

      await registry.register(adapter1);
      await registry.register(adapter2);

      expect(registry.get('adapter1')).toBe(adapter1);
      expect(registry.get('adapter2')).toBe(adapter2);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no adapters registered', () => {
      const result = registry.getAll();

      expect(result).toEqual([]);
    });

    it('should return all registered adapters', async () => {
      const adapter1 = createMockAdapter('adapter1');
      const adapter2 = createMockAdapter('adapter2');

      await registry.register(adapter1);
      await registry.register(adapter2);

      const result = registry.getAll();

      expect(result).toHaveLength(2);
      expect(result).toContain(adapter1);
      expect(result).toContain(adapter2);
    });
  });

  describe('composeDiscovery', () => {
    it('should compose discovery from all adapters', async () => {
      const adapter1 = createMockAdapter('adapter1', {
        discoveryFragment: { capabilities: ['cap1'] },
      });
      const adapter2 = createMockAdapter('adapter2', {
        discoveryFragment: { features: ['feature1'] },
      });

      await registry.register(adapter1);
      await registry.register(adapter2);

      const result = registry.composeDiscovery();

      expect(result).toEqual({
        capabilities: ['cap1'],
        features: ['feature1'],
      });
      expect(adapter1.discoveryFragment).toHaveBeenCalled();
      expect(adapter2.discoveryFragment).toHaveBeenCalled();
    });

    it('should handle empty discovery fragments', async () => {
      const adapter1 = createMockAdapter('adapter1', {
        discoveryFragment: {},
      });
      const adapter2 = createMockAdapter('adapter2', {
        discoveryFragment: { features: ['feature1'] },
      });

      await registry.register(adapter1);
      await registry.register(adapter2);

      const result = registry.composeDiscovery();

      expect(result).toEqual({
        features: ['feature1'],
      });
    });

    it('should handle discovery fragment errors gracefully', async () => {
      const adapter1 = createMockAdapter('failing-adapter', {
        discoveryFragment: jest.fn(() => {
          throw new Error('Discovery failed');
        }),
      });
      const adapter2 = createMockAdapter('working-adapter', {
        discoveryFragment: { features: ['feature1'] },
      });

      await registry.register(adapter1);
      await registry.register(adapter2);

      const result = registry.composeDiscovery();

      expect(result).toEqual({
        features: ['feature1'],
      });
    });

    it('should merge overlapping discovery fragments', async () => {
      const adapter1 = createMockAdapter('adapter1', {
        discoveryFragment: { common: { prop1: 'value1' }, unique1: 'val1' },
      });
      const adapter2 = createMockAdapter('adapter2', {
        discoveryFragment: { common: { prop2: 'value2' }, unique2: 'val2' },
      });

      await registry.register(adapter1);
      await registry.register(adapter2);

      const result = registry.composeDiscovery();

      expect(result).toEqual({
        common: { prop1: 'value1', prop2: 'value2' },
        unique1: 'val1',
        unique2: 'val2',
      });
    });
  });

  describe('shutdown', () => {
    it('should shutdown all adapters', async () => {
      const adapter1 = createMockAdapter('adapter1');
      const adapter2 = createMockAdapter('adapter2');

      await registry.register(adapter1);
      await registry.register(adapter2);

      await registry.shutdown();

      expect(adapter1.shutdown).toHaveBeenCalled();
      expect(adapter2.shutdown).toHaveBeenCalled();
    });

    it('should handle adapters without shutdown method', async () => {
      const adapterWithoutShutdown = createMockAdapter('no-shutdown', {
        shutdown: undefined,
      });
      delete adapterWithoutShutdown.shutdown;

      await registry.register(adapterWithoutShutdown);

      await expect(registry.shutdown()).resolves.toBeUndefined();
    });

    it('should handle shutdown errors gracefully', async () => {
      const failingAdapter = createMockAdapter('failing', {
        shutdown: jest.fn().mockRejectedValue(new Error('Shutdown failed')),
      });
      const workingAdapter = createMockAdapter('working');

      await registry.register(failingAdapter);
      await registry.register(workingAdapter);

      await expect(registry.shutdown()).resolves.toBeUndefined();

      expect(failingAdapter.shutdown).toHaveBeenCalled();
      expect(workingAdapter.shutdown).toHaveBeenCalled();
    });

    it('should clear all adapters after shutdown', async () => {
      const adapter = createMockAdapter('test');
      await registry.register(adapter);

      expect(registry.get('test')).toBe(adapter);

      await registry.shutdown();

      expect(registry.get('test')).toBeUndefined();
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('configuration handling', () => {
    it('should ignore environment variables without values', async () => {
      process.env.PEAC_ADAPTER_CONFIG_WITH_VALUE = 'has-value';
      process.env.PEAC_ADAPTER_CONFIG_WITHOUT_VALUE = '';
      delete process.env.PEAC_ADAPTER_CONFIG_UNDEFINED;

      const mockAdapter = createMockAdapter('config');

      await registry.register(mockAdapter);

      expect(mockAdapter.initialize).toHaveBeenCalledWith({
        with_value: 'has-value',
      });

      delete process.env.PEAC_ADAPTER_CONFIG_WITH_VALUE;
      delete process.env.PEAC_ADAPTER_CONFIG_WITHOUT_VALUE;
    });

    it('should handle complex configuration keys', async () => {
      process.env.PEAC_ADAPTER_COMPLEX_MULTI_WORD_KEY = 'complex-value';
      process.env.PEAC_ADAPTER_COMPLEX_SIMPLE = 'simple';

      const mockAdapter = createMockAdapter('complex');

      await registry.register(mockAdapter);

      expect(mockAdapter.initialize).toHaveBeenCalledWith({
        multi_word_key: 'complex-value',
        simple: 'simple',
      });

      delete process.env.PEAC_ADAPTER_COMPLEX_MULTI_WORD_KEY;
      delete process.env.PEAC_ADAPTER_COMPLEX_SIMPLE;
    });
  });
});

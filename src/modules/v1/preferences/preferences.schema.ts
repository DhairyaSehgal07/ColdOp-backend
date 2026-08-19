export const markaTypeProperty = {
  type: "string" as const,
  description: 'Marka display type (default: "GatePass")',
  default: "GatePass",
};

export const preferencesDataProperties = {
  _id: { type: "string" },
  commodities: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        varieties: {
          type: "array",
          items: { type: "string" },
        },
        sizes: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  reportFormat: { type: "string" },
  showFinances: { type: "boolean" },
  showViewFilters: { type: "boolean" },
  generation: {
    type: "object",
    properties: {
      enabled: { type: "boolean" },
      options: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  labourCost: { type: "number" },
  stockFilter: {
    type: "object",
    properties: {
      enabled: { type: "boolean" },
      options: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  customMarka: { type: "boolean" },
  markaType: markaTypeProperty,
  customFields: {
    type: "object",
    additionalProperties: true,
  },
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
};

export const updatePreferencesBodyProperties = {
  commodities: {
    type: "array",
    items: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        varieties: {
          type: "array",
          items: { type: "string" },
        },
        sizes: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  reportFormat: { type: "string" },
  showFinances: { type: "boolean" },
  showViewFilters: { type: "boolean" },
  generation: {
    type: "object",
    required: ["enabled"],
    properties: {
      enabled: { type: "boolean" },
      options: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  labourCost: { type: "number", minimum: 0 },
  stockFilter: {
    type: "object",
    required: ["enabled"],
    properties: {
      enabled: { type: "boolean" },
      options: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  customMarka: { type: "boolean" },
  markaType: {
    ...markaTypeProperty,
    minLength: 1,
  },
  customFields: {
    type: "object",
    additionalProperties: true,
  },
};

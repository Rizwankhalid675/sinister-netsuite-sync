import type { GadgetPermissions } from "gadget-server";

/**
 * This metadata describes the access control configuration available in your application.
 * Grants that are not defined here are set to false by default.
 *
 * View and edit your roles and permissions in the Gadget editor at https://enshield-shipping-protection.gadget.app/edit/settings/permissions
 */
export const permissions: GadgetPermissions = {
  type: "gadget/permissions/v1",
  roles: {
    "shopify-app-users": {
      storageKey: "Role-Shopify-App",
      models: {
        shopifyCart: {
          read: {
            filter: "accessControl/filters/shopify/shopifyCart.gelly",
          },
        },
        shopifyOrder: {
          read: {
            filter:
              "accessControl/filters/shopify/shopifyOrder.gelly",
          },
        },
        shopifyShop: {
          read: {
            filter: "accessControl/filters/shopify/shopifyShop.gelly",
          },
        },
        shopifySync: {
          read: {
            filter: "accessControl/filters/shopify/shopifySync.gelly",
          },
        },
      },
    },
    unauthenticated: {
      storageKey: "unauthenticated",
      actions: {
        backfillClients: true,
        seedDevAppUser: true,
        seedDevOperator: true,
      },
    },
    "Role A": {
      storageKey: "lymQO_VChbME",
      default: {
        read: true,
        action: true,
      },
      models: {
        accountingEntity: {
          read: true,
        },
        accountingPeriod: {
          read: true,
        },
        appRole: {
          read: true,
          actions: {
            create: true,
            update: true,
          },
        },
        appUser: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        auditLog: {
          read: true,
        },
        claim: {
          read: true,
          actions: {
            create: true,
            update: true,
          },
        },
        claimEvent: {
          read: true,
        },
        claimPayment: {
          read: true,
          actions: {
            create: true,
            verify: true,
          },
        },
        claimReserve: {
          read: true,
          actions: {
            adjust: true,
            create: true,
            release: true,
          },
        },
        claimReserveMovement: {
          read: true,
        },
        client: {
          read: true,
          actions: {
            create: true,
            update: true,
          },
        },
        financeOperationReceipt: {
          read: true,
        },
        financeProfile: {
          read: true,
        },
        financialEvent: {
          read: true,
          actions: {
            create: true,
          },
        },
        integrationDelivery: {
          read: true,
        },
        integrationDeliveryAttempt: {
          read: true,
        },
        internalAuthReceipt: {
          read: true,
        },
        internalOperator: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        journalEntry: {
          read: true,
          actions: {
            approve: true,
            create: true,
            post: true,
            reverse: true,
            submit: true,
            update: true,
          },
        },
        journalLine: {
          read: true,
          actions: {
            create: true,
          },
        },
        ledgerAccount: {
          read: true,
          actions: {
            create: true,
          },
        },
        operatorShopAssignment: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        payableAllocation: {
          read: true,
        },
        payableDocument: {
          read: true,
          actions: {
            allocate: true,
            approve: true,
            create: true,
          },
        },
        receivableAllocation: {
          read: true,
        },
        receivableDocument: {
          read: true,
          actions: {
            allocate: true,
            approve: true,
            create: true,
          },
        },
        reconciliationItem: {
          read: true,
          actions: {
            resolve: true,
          },
        },
        reconciliationRun: {
          read: true,
          actions: {
            complete: true,
            create: true,
          },
        },
        reportRun: {
          read: true,
        },
        session: {
          read: true,
        },
        shippingInsuranceProduct: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        shippingInsuranceSetting: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        shopifyCart: {
          read: true,
          actions: {
            create: true,
            update: true,
          },
        },
        shopifyOrder: {
          read: true,
          actions: {
            create: true,
            delete: true,
            update: true,
          },
        },
        shopifyShop: {
          read: true,
          actions: {
            install: true,
            reinstall: true,
            uninstall: true,
            update: true,
          },
        },
        shopifySync: {
          read: true,
          actions: {
            abort: true,
            complete: true,
            error: true,
            run: true,
          },
        },
        webhookAttempt: {
          read: true,
        },
        webhookReceipt: {
          read: true,
        },
      },
      actions: {
        backfillClients: true,
        createInsuranceVariants: true,
        processIntegrationDelivery: true,
        reconcileClients: true,
        replayIntegrationDelivery: true,
        seedAppRoles: true,
        seedDevAppUser: true,
        seedDevOperator: true,
        seedDevSuperAdmin: true,
        sendOrderToEnshield: true,
        sendTrackingToEnshield: true,
        setupInsuranceProduct: true,
        setupShippingInsuranceProduct: true,
        sweepIntegrationDeliveries: true,
      },
    },
  },
};

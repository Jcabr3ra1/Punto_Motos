import uuid

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.accounts.models import Role
from apps.cash.models import CashMovement, CashMovementKind
from apps.core.models import BusinessSettings, PaymentMethod
from apps.inventory.models import InsufficientStock, InventoryMovement, MovementKind, NotWorkshopSupply
from apps.sales.models import EmptySale, LaborPriceChangeNotAllowed, PaymentMismatch, Sale, SaleService
from apps.workshop.models import Mechanic, ServiceType

from .helpers import make_user
from .test_catalog_models import make_product
from .test_sales_models import SalesTestCase, stock_of


def make_service_type(code=101, name="Cambio de aceite", suggested_price=15000, **extra):
    return ServiceType.objects.create(code=code, name=name, suggested_price=suggested_price, **extra)


class ServiceTypeTests(TestCase):
    def test_name_and_code_are_unique(self):
        make_service_type()

        with self.assertRaises(IntegrityError), transaction.atomic():
            make_service_type(code=102, name="cambio de ACEITE")
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_service_type(name="Frenos")

    def test_orders_by_code_and_prints_code_and_name(self):
        make_service_type(code=200, name="Frenos")
        oil = make_service_type()

        self.assertEqual(ServiceType.objects.first(), oil)
        self.assertEqual(str(oil), "101 · Cambio de aceite")


class MechanicTests(TestCase):
    def test_uses_general_percentage_until_it_has_its_own(self):
        mechanic = Mechanic.objects.create(name="Carlos Ruiz")

        self.assertEqual(mechanic.effective_percentage, 60)
        settings = BusinessSettings.load()
        settings.default_mechanic_percentage = 55
        settings.save()
        self.assertEqual(mechanic.effective_percentage, 55)
        mechanic.labor_percentage = 70
        self.assertEqual(mechanic.effective_percentage, 70)
        mechanic.labor_percentage = 0
        self.assertEqual(mechanic.effective_percentage, 0)

    def test_percentage_cannot_pass_100(self):
        with self.assertRaises(ValidationError):
            Mechanic(name="Carlos Ruiz", labor_percentage=101).full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Mechanic.objects.create(name="Carlos Ruiz", labor_percentage=101)


class WorkshopSalesTestCase(SalesTestCase):
    """Ventas con servicios: dos mecánicos y los tipos «Cambio de aceite» y «Otro»."""

    def setUp(self):
        super().setUp()
        self.oil = make_service_type()
        self.other = make_service_type(code=999, name="Otro", suggested_price=0)
        self.carlos = Mechanic.objects.create(name="Carlos Ruiz")
        self.pedro = Mechanic.objects.create(name="Pedro Gómez")

    def sell(self, items=(), services=(), user=None, payments=None):
        """Sin payments, paga el total en efectivo."""
        if payments is None:
            total = sum(item.get("unit_price", item["product"].sale_price) * item["quantity"] for item in items)
            total += sum(service.get("labor_price", service["service_type"].suggested_price) for service in services)
            payments = [{"amount": total, "method": PaymentMethod.CASH}] if total else []
        return Sale.objects.confirm(
            self.customer, list(items), payments, user or self.seller, uuid.uuid4(), services=list(services),
        )


class SaleWithServicesTests(WorkshopSalesTestCase):

    def test_service_with_part_charges_both_and_discounts_part_once(self):
        sale, _ = self.sell(
            items=[{"product": self.brakes, "quantity": 1}],
            services=[{"service_type": self.oil, "mechanic": self.carlos, "plate": "abc-12d"}],
        )

        self.assertEqual(sale.total, 25000 + 15000)
        service = sale.services.get()
        self.assertEqual((service.mechanic, service.plate), (self.carlos, "ABC12D"))
        self.assertEqual((service.suggested_price, service.labor_price), (15000, 15000))
        self.assertFalse(service.price_changed)
        self.assertEqual(stock_of(self.brakes), 4)
        self.assertEqual(self.brakes.movements.filter(kind=MovementKind.SALE).count(), 1)
        self.assertEqual(CashMovement.objects.get(kind=CashMovementKind.SALE).amount, 40000)

    def test_sale_can_be_only_services_each_with_its_mechanic(self):
        sale, _ = self.sell(services=[
            {"service_type": self.oil, "mechanic": self.carlos},
            {"service_type": self.oil, "mechanic": self.pedro},
        ])

        self.assertEqual(sale.total, 30000)
        self.assertEqual(sale.items.count(), 0)
        self.assertEqual([s.mechanic for s in sale.services.all()], [self.carlos, self.pedro])

    def test_sale_without_products_or_services_is_rejected(self):
        with self.assertRaises(EmptySale):
            self.sell()

    def test_only_owner_changes_labor_price(self):
        with self.assertRaises(LaborPriceChangeNotAllowed):
            self.sell(services=[{"service_type": self.oil, "mechanic": self.carlos, "labor_price": 20000}])
        self.assertFalse(Sale.objects.exists())

        sale, _ = self.sell(
            services=[{"service_type": self.oil, "mechanic": self.carlos, "labor_price": 20000}], user=self.owner,
        )
        service = sale.services.get()
        self.assertEqual((service.suggested_price, service.labor_price), (15000, 20000))
        self.assertTrue(service.price_changed)
        self.assertEqual(sale.total, 20000)

    def test_other_service_description_is_optional(self):
        without, _ = self.sell(
            services=[{"service_type": self.other, "mechanic": self.carlos, "labor_price": 8000}], user=self.owner,
        )
        self.assertEqual(without.services.get().details, "")

        sale, _ = self.sell(
            services=[{
                "service_type": self.other, "mechanic": self.carlos, "labor_price": 8000,
                "details": "  Revisión  de luces ",
            }],
            user=self.owner,
        )
        self.assertEqual(sale.services.get().details, "Revisión de luces")

    def test_inactive_mechanic_or_service_type_is_rejected(self):
        self.pedro.is_active = False
        self.pedro.save()
        with self.assertRaises(ValidationError) as error:
            self.sell(services=[{"service_type": self.oil, "mechanic": self.pedro}])
        self.assertIn("mechanic", error.exception.message_dict)

        self.oil.is_active = False
        self.oil.save()
        with self.assertRaises(ValidationError) as error:
            self.sell(services=[{"service_type": self.oil, "mechanic": self.carlos}])
        self.assertIn("service_type", error.exception.message_dict)

    def test_payment_must_cover_services(self):
        with self.assertRaises(PaymentMismatch):
            self.sell(
                items=[{"product": self.brakes, "quantity": 1}],
                services=[{"service_type": self.oil, "mechanic": self.carlos}],
                payments=[{"amount": 25000, "method": PaymentMethod.CASH}],
            )
        self.assertFalse(SaleService.objects.exists())
        self.assertEqual(stock_of(self.brakes), 5)

    def test_suggested_price_change_does_not_alter_past_sales(self):
        sale, _ = self.sell(services=[{"service_type": self.oil, "mechanic": self.carlos}])
        self.oil.suggested_price = 18000
        self.oil.save()

        service = sale.services.get()
        self.assertEqual((service.suggested_price, service.labor_price), (15000, 15000))

    def test_void_refunds_services_too(self):
        sale, _ = self.sell(
            items=[{"product": self.brakes, "quantity": 1}],
            services=[{"service_type": self.oil, "mechanic": self.carlos}],
        )

        sale.void(self.owner, "Se cobró dos veces")

        refund = CashMovement.objects.get(kind=CashMovementKind.SALE_REFUND)
        self.assertEqual(refund.amount, -40000)
        self.assertEqual(stock_of(self.brakes), 5)
        self.assertEqual(sale.services.count(), 1)  # el servicio queda en el historial


class WorkshopUseTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.grease = make_product(code="LUB-UNI-GRA", name="Grasa multiuso", is_workshop_supply=True)
        self.brakes = make_product()
        InventoryMovement.objects.record(self.grease, MovementKind.INITIAL_COUNT, 3, self.owner)
        InventoryMovement.objects.record(self.brakes, MovementKind.INITIAL_COUNT, 3, self.owner)

    def test_takes_out_workshop_supply_at_cost(self):
        movement = InventoryMovement.objects.use_in_workshop(self.grease, 1, self.owner, reason="Envase abierto")

        self.assertEqual((movement.kind, movement.quantity, movement.unit_cost), (MovementKind.WORKSHOP_USE, -1, 18000))
        self.assertEqual(stock_of(self.grease), 2)

    def test_rejects_products_that_are_not_workshop_supply(self):
        with self.assertRaises(NotWorkshopSupply):
            InventoryMovement.objects.use_in_workshop(self.brakes, 1, self.owner)
        self.assertEqual(stock_of(self.brakes), 3)

    def test_rejects_more_than_stock_and_non_positive_quantities(self):
        with self.assertRaises(InsufficientStock):
            InventoryMovement.objects.use_in_workshop(self.grease, 4, self.owner)
        for quantity in (0, -1):
            with self.assertRaises(ValidationError):
                InventoryMovement.objects.use_in_workshop(self.grease, quantity, self.owner)
        self.assertEqual(stock_of(self.grease), 3)

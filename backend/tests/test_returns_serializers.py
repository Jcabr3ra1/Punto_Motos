import uuid

from rest_framework.exceptions import ValidationError

from apps.cash.exceptions import NoOpenCashSession
from apps.cash.models import CashSession
from apps.sales.exceptions import SaleVoided, SaleWithReturns
from apps.sales.models import ReturnCause, Sale, SaleReturn
from apps.sales.serializers import (
    SaleDetailSerializer,
    SaleReturnDetailSerializer,
    SaleReturnSerializer,
    SaleReturnWriteSerializer,
    VoidSaleSerializer,
    sale_return_with_lines,
)
from apps.workshop.models import MechanicSettlement
from apps.workshop.serializers import MechanicSettlementDetailSerializer, SettlementPreviewSerializer, settlement_with_services

from .test_catalog_serializers import context_for
from .test_returns_models import ReturnsTestCase
from .test_sales_models import stock_of


class ReturnSerializerTestCase(ReturnsTestCase):
    def data(self, **extra):
        data = {
            "idempotency_key": str(uuid.uuid4()),
            "cause": "other",
            "reason": "  El cliente   reclamó ",
            "items": [{"sale_item": self.item.pk, "quantity": 1, "condition": "resellable"}],
            "refunds": [{"method": "cash", "amount": 25000}],
        }
        data.update(extra)
        return data

    def serializer(self, data, user=None, sale=None):
        context = {**context_for(user or self.owner), "sale": sale or self.sale}
        return SaleReturnWriteSerializer(data=data, context=context)

    def errors(self, data, user=None):
        serializer = self.serializer(data, user)
        if serializer.is_valid():
            with self.assertRaises(ValidationError) as raised:
                serializer.save()
            return raised.exception.detail
        return serializer.errors

    def register(self, data, user=None, sale=None):
        serializer = self.serializer(data, user, sale)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer


class WriteTests(ReturnSerializerTestCase):
    def test_registers_and_returns_the_full_document(self):
        before = stock_of(self.brakes)

        serializer = self.register(self.data())
        data = serializer.data

        self.assertTrue(serializer.created)
        self.assertEqual(stock_of(self.brakes), before + 1)
        self.assertEqual((data["number"], data["sale"], data["sale_number"]), (1, self.sale.pk, self.sale.number))
        self.assertEqual((data["cause"], data["cause_label"]), ("other", "Otra causa"))
        self.assertEqual((data["reason"], data["total"]), ("El cliente reclamó", 25000))
        self.assertEqual(data["customer"]["id"], self.sale.customer_id)
        line = data["items"][0]
        self.assertEqual((line["sale_item"], line["product"]["id"]), (self.item.pk, self.brakes.pk))
        self.assertEqual((line["quantity"], line["condition_label"]), (1, "Vuelve al inventario"))
        self.assertEqual((line["unit_price"], line["subtotal"]), (25000, 25000))
        self.assertEqual(data["services"], [])
        self.assertEqual(
            [dict(refund) for refund in data["refunds"]],
            [{"method": "cash", "method_label": "Efectivo", "amount": 25000}],
        )
        self.assertIsNone(data["mechanic_deduction"])

    def test_same_key_does_not_repeat_and_says_so(self):
        data = self.data()
        first = self.register(data)
        before = stock_of(self.brakes)

        again = self.register(data)

        self.assertFalse(again.created)
        self.assertEqual(again.data["id"], first.data["id"])
        self.assertEqual(stock_of(self.brakes), before)

    def test_service_line_goes_by_id(self):
        data = self.register(self.data(
            items=[], services=[self.service.pk], refunds=[{"method": "transfer", "amount": 15000}],
        )).data

        line = data["services"][0]
        self.assertEqual((line["sale_service"], line["labor_price"]), (self.service.pk, 15000))
        self.assertEqual((line["service_type"]["id"], line["mechanic"]["id"]), (self.oil.pk, self.carlos.pk))

    def test_condition_is_required(self):
        errors = self.errors(self.data(items=[{"sale_item": self.item.pk, "quantity": 1}]))

        self.assertIn("condition", errors["items"][0])

    def test_reason_is_required_and_short(self):
        self.assertEqual(self.errors(self.data(reason="   "))["reason"][0].code, "blank")
        self.assertIn("reason", self.errors(self.data(reason="x" * 151)))

    def test_refund_method_goes_once(self):
        errors = self.errors(self.data(refunds=[
            {"method": "cash", "amount": 5000}, {"method": "cash", "amount": 20000},
        ]))

        self.assertEqual(errors["refunds"], ["Cada medio de pago va una sola vez: suma los valores."])

    def test_empty_return(self):
        errors = self.errors(self.data(items=[], refunds=[]))

        self.assertEqual(errors["items"], ["Indica al menos un producto o un servicio para devolver."])

    def test_refund_mismatch_points_at_refunds(self):
        errors = self.errors(self.data(refunds=[{"method": "cash", "amount": 1000}]))

        self.assertEqual(errors["refunds"], ["La devolución es de $25.000 y el reembolso suma $1.000: deben ser iguales."])
        self.assertFalse(SaleReturn.objects.exists())

    def test_too_many_units_points_at_the_line(self):
        errors = self.errors(self.data(
            items=[{"sale_item": self.item.pk, "quantity": 3, "condition": "resellable"}],
            refunds=[{"method": "cash", "amount": 75000}],
        ))

        self.assertEqual(errors["items"][0]["quantity"], [f"Solo quedan 2 por devolver de {self.item.description}."])

    def test_nothing_left_to_return(self):
        self.register(self.data(
            items=[{"sale_item": self.item.pk, "quantity": 2, "condition": "damaged"}],
            refunds=[{"method": "cash", "amount": 50000}],
        ))

        errors = self.errors(self.data())

        self.assertEqual(errors["items"][0]["quantity"], [f"Ya se devolvieron todas las unidades de {self.item.description}."])

    def test_service_already_returned(self):
        data = {"items": [], "services": [self.service.pk], "refunds": [{"method": "cash", "amount": 15000}]}
        self.register(self.data(**data))

        errors = self.errors(self.data(**data))

        self.assertEqual(errors["services"], [f"El servicio «{self.oil.name}» ya se devolvió."])

    def test_line_of_another_sale_is_rejected(self):
        other, _ = self.sell(items=[{"product": self.plug, "quantity": 1}])

        errors = self.errors(self.data(items=[{"sale_item": other.items.get().pk, "quantity": 1, "condition": "resellable"}]))

        self.assertEqual(errors["items"], ["Este producto no es de esta venta."])

    def test_bad_service_needs_the_owner(self):
        errors = self.errors(self.data(
            cause="bad_service", items=[], services=[self.service.pk], refunds=[{"method": "cash", "amount": 15000}],
        ), user=self.seller)

        self.assertEqual(errors["cause"], ["Solo el dueño puede registrar una devolución por mal servicio."])

    def test_bad_service_of_two_mechanics_is_rejected(self):
        two, _ = self.sell(services=[
            {"service_type": self.oil, "mechanic": self.carlos},
            {"service_type": self.oil, "mechanic": self.pedro},
        ])
        serializer = self.serializer(self.data(
            cause="bad_service", items=[], services=[service.pk for service in two.services.all()],
            refunds=[{"method": "cash", "amount": 30000}],
        ), sale=two)
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(ValidationError) as raised:
            serializer.save()

        self.assertEqual(raised.exception.detail["services"], ["Indica los servicios de un solo mecánico."])

    def test_closed_cash_is_a_conflict(self):
        session = CashSession.objects.current()
        session.close(session.current_expected_cash, self.owner)
        serializer = self.serializer(self.data())
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(NoOpenCashSession):
            serializer.save()

    def test_voided_sale_is_a_conflict(self):
        self.sale.void(self.owner, "Error")
        serializer = self.serializer(self.data())
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(SaleVoided):
            serializer.save()


class ReadTests(ReturnSerializerTestCase):
    def bad_service(self):
        return self.give_back(services=[self.service], cause=ReturnCause.BAD_SERVICE)[0]

    def detail(self, sale_return, user):
        instance = sale_return_with_lines().get(pk=sale_return.pk)
        return SaleReturnDetailSerializer(instance, context=context_for(user)).data

    def test_owner_sees_the_deduction(self):
        deduction = self.detail(self.bad_service(), self.owner)["mechanic_deduction"]

        self.assertEqual(deduction["mechanic"], {"id": self.carlos.pk, "name": "Carlos Ruiz"})
        self.assertEqual((deduction["amount"], deduction["applied_amount"], deduction["pending_amount"]), (15000, 0, 15000))

    def test_seller_does_not_see_the_deduction(self):
        self.assertNotIn("mechanic_deduction", self.detail(self.bad_service(), self.seller))

    def test_list_row_has_no_lines(self):
        data = SaleReturnSerializer(self.bad_service(), context=context_for(self.owner)).data

        self.assertEqual(data["cause_label"], "Mal servicio del mecánico")
        self.assertNotIn("items", data)

    def test_sale_shows_what_was_returned(self):
        before = SaleDetailSerializer(self.sale, context=context_for(self.owner)).data
        self.assertEqual(before["items"][0]["returned_quantity"], 0)
        self.assertFalse(before["services"][0]["is_returned"])

        self.give_back(items=[self.line()], services=[self.service])

        sale = Sale.objects.get(pk=self.sale.pk)
        after = SaleDetailSerializer(sale, context=context_for(self.owner)).data
        self.assertEqual(after["items"][0]["returned_quantity"], 1)
        self.assertTrue(after["services"][0]["is_returned"])

    def test_voiding_a_sale_with_returns_is_a_conflict(self):
        self.give_back(items=[self.line()])
        serializer = VoidSaleSerializer(self.sale, data={"reason": "Ya no"}, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(SaleWithReturns):
            serializer.save()


class SettlementWithDeductionSerializerTests(ReturnSerializerTestCase):
    def setUp(self):
        super().setUp()
        self.give_back(services=[self.service], cause=ReturnCause.BAD_SERVICE)    # 15.000; su parte es 9.000

    def test_preview_shows_share_and_deductions(self):
        row = SettlementPreviewSerializer(MechanicSettlement.objects.preview(self.today), many=True).data[0]

        self.assertEqual((row["share"], row["deductions_total"], row["amount"]), (9000, 9000, 0))

    def test_settlement_sheet_lists_the_deductions(self):
        settlement = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        data = MechanicSettlementDetailSerializer(
            settlement_with_services(settlement.pk), context=context_for(self.owner),
        ).data

        self.assertEqual((data["deductions_total"], data["amount"]), (9000, 0))
        deduction = data["deductions"][0]
        self.assertEqual((deduction["amount"], deduction["deduction_total"], deduction["pending_amount"]), (9000, 15000, 6000))
        self.assertEqual((deduction["sale_return_number"], deduction["sale_number"]), (1, self.sale.number))
        self.assertEqual((deduction["customer"], deduction["reason"]), (self.sale.customer.name, "El cliente reclamó"))
        self.assertEqual(deduction["services"][0]["service_type"]["id"], self.oil.pk)
        self.assertEqual(deduction["services"][0]["labor_price"], 15000)

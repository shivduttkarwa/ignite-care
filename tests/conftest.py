import pytest
from django.contrib.auth import get_user_model

from apps.people.models import Home, Participant, StaffProfile

User = get_user_model()


@pytest.fixture
def acacia(db):
    return Home.objects.create(name="Acacia House", short_name="Acacia House", position=0)


@pytest.fixture
def banksia(db):
    return Home.objects.create(name="Banksia House", short_name="Banksia House", position=1)


def _staff(username, home, role=StaffProfile.Role.WORKER, first="Test", last="Worker"):
    user = User.objects.create_user(
        username=username, password="portal-testing-2026", first_name=first, last_name=last
    )
    profile = StaffProfile.objects.create(user=user, role=role)
    if home:
        profile.homes.add(home)
    return user


@pytest.fixture
def worker(acacia):
    return _staff("karen", acacia, first="Karen", last="Mitchell")


@pytest.fixture
def other_worker(banksia):
    return _staff("tom", banksia, first="Tom", last="Edwards")


@pytest.fixture
def manager(acacia, banksia):
    user = _staff("sonia", acacia, role=StaffProfile.Role.MANAGER, first="Sonia", last="Delacroix")
    user.staff_profile.homes.add(banksia)
    return user


@pytest.fixture
def daniel(acacia):
    return Participant.objects.create(
        first_name="Daniel",
        last_name="Reeves",
        preferred_name="Danny",
        home=acacia,
        room="Room 2",
    )


@pytest.fixture
def grace(banksia):
    return Participant.objects.create(first_name="Grace", last_name="Tuilagi", home=banksia)
